import hashlib
import json
from datetime import date, datetime

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db.models import Prefetch, Q
from django.utils import timezone
from ninja import Router, Schema
from pydantic import Field

from apps.assets.models import Vehiculo
from apps.catalogs.models import Configuracion
from apps.core.permisos import exigir_permiso
from apps.core.schemas import Punto
from apps.operations.models import OrdenDeTrabajo, OTUnidadAsignada, Solicitud, Trabajo

from . import optimizador as opt
from .tiempos import geometria_ruta

router = Router(tags=["planificación"])

TIPO_CANASTA = "camionCanasta"
JORNADA_POR_DEFECTO = 8 * 60


# --- Esquemas --------------------------------------------------------------------


class RutaIn(Schema):
    id: str = Field(min_length=1)
    vehiculos: list[str] = Field(min_length=1)
    fijas: list[int] = []  # solicitudes que deben ir en esta ruta


class OptimizarIn(Schema):
    fecha: date | None = None  # pendientes programadas hasta esta fecha (hoy por defecto)
    solicitudes: list[int] | None = None  # o un subconjunto explícito
    rutas: list[RutaIn] = Field(min_length=1)
    tiempo_limite_s: int = Field(default=10, ge=1, le=60)


class VisitaOut(Schema):
    solicitud_id: int
    display_id: str
    equipo: str
    direccion: str
    lat: float
    lng: float
    llegada_min: int
    servicio_min: int
    urgente: bool
    requiere_canasta: bool


class RutaOut(Schema):
    id: str
    vehiculos: list[str]
    visitas: list[VisitaOut]
    minutos_viaje: int
    minutos_servicio: int
    minutos_total: int
    geometria: list[list[float]]


class NoAsignadaOut(Schema):
    solicitud_id: int
    display_id: str
    equipo: str
    lat: float
    lng: float
    urgente: bool
    motivo: str


class PlanOut(Schema):
    sede: Punto
    jornada_min: int
    hora_inicio: str | None
    fuente_tiempos: str
    rutas: list[RutaOut]
    no_asignadas: list[NoAsignadaOut]


class TrabajoMapa(Schema):
    id: int
    secuencia: int
    estado: str
    equipo: str
    lat: float
    lng: float


class RutaDelDia(Schema):
    orden_id: int
    display_id: str
    estado_general: str
    placas: list[str]
    tecnicos: list[str]
    trabajos: list[TrabajoMapa]
    geometria: list[list[float]]


class RutasDelDiaOut(Schema):
    sede: Punto | None
    rutas: list[RutaDelDia]


# --- Utilidades -----------------------------------------------------------------


def _sede_y_jornada() -> tuple[Configuracion, tuple[float, float], int]:
    config = Configuracion.get_solo()
    if not config.sede_central_ubicacion:
        raise ValidationError(
            "Configura la ubicación de la sede central (Configuración → General)."
        )
    sede = (config.sede_central_ubicacion.y, config.sede_central_ubicacion.x)
    jornada = JORNADA_POR_DEFECTO
    if config.hora_inicio_jornada and config.hora_fin_jornada:
        inicio = datetime.combine(date.min, config.hora_inicio_jornada)
        fin = datetime.combine(date.min, config.hora_fin_jornada)
        jornada = int((fin - inicio).total_seconds() // 60)
    jornada -= config.minutos_planificacion + config.minutos_reporte + config.minutos_almuerzo
    if jornada <= 0:
        raise ValidationError("La jornada configurada no deja tiempo para trabajar.")
    return config, sede, jornada


def _geometria(puntos: list[tuple[float, float]]) -> list[list[float]]:
    """Trazado por calles, con caché de 6 horas (OSRM es determinista)."""
    clave = "ruta:" + hashlib.sha1(json.dumps(puntos).encode()).hexdigest()
    geometria = cache.get(clave)
    if geometria is None:
        geometria = geometria_ruta(puntos)
        cache.set(clave, geometria, 6 * 3600)
    return geometria


# --- Endpoints --------------------------------------------------------------------


@router.post("/optimizar", response=PlanOut)
def optimizar(request, payload: OptimizarIn):
    """Propone rutas para las solicitudes pendientes. No crea nada: el supervisor
    revisa la propuesta y la confirma creando las órdenes (POST /api/ordenes)."""
    exigir_permiso(request, "operations.add_ordendetrabajo")
    config, sede, jornada = _sede_y_jornada()

    todos = {c for r in payload.rutas for c in r.vehiculos}
    vehiculos = {
        v.codigo: v for v in Vehiculo.objects.filter(codigo__in=todos).select_related("tipo")
    }
    if faltan := todos - set(vehiculos):
        raise ValidationError(f"Vehículos inexistentes: {sorted(faltan)}")
    repetidos = [c for c in todos if sum(c in r.vehiculos for r in payload.rutas) > 1]
    if repetidos:
        raise ValidationError(f"Un vehículo no puede estar en dos rutas: {sorted(repetidos)}")
    rutas = []
    for r in payload.rutas:
        canastas = [c for c in r.vehiculos if vehiculos[c].tipo.valor == TIPO_CANASTA]
        if canastas and len(r.vehiculos) < 2:
            raise ValidationError(
                f"Ruta {r.id}: el camión canasta {canastas[0]} no puede salir solo; añade una unidad acompañante."
            )
        rutas.append(opt.Ruta(r.id, tiene_canasta=bool(canastas)))

    qs = Solicitud.objects.filter(estado=Solicitud.Estado.PENDIENTE).select_related(
        "equipo", "urgencia", "tipo_trabajo"
    )
    if payload.solicitudes is not None:
        qs = qs.filter(pk__in=payload.solicitudes)
    else:
        qs = qs.filter(fecha_programada__lte=payload.fecha or timezone.localdate())
    fijas = {sid: r.id for r in payload.rutas for sid in r.fijas}
    solicitudes = {s.pk: s for s in qs}
    paradas = [
        opt.Parada(
            id=s.pk,
            punto=(s.equipo.ubicacion.y, s.equipo.ubicacion.x),
            servicio_min=s.tiempo_servicio_estimado or s.tipo_trabajo.tiempo_estimado_minutos,
            urgente=s.urgencia.valor == "urgente",
            requiere_canasta=s.equipo.requiere_canasta,
            ruta_fija=fijas.get(s.pk),
        )
        for s in solicitudes.values()
    ]
    resultado = opt.optimizar(sede, rutas, paradas, jornada, payload.tiempo_limite_s)

    def visita(v: opt.Visita):
        s = solicitudes[v.parada.id]
        return {
            "solicitud_id": s.pk,
            "display_id": s.display_id,
            "equipo": s.equipo.codigo,
            "direccion": s.equipo.direccion,
            "lat": v.parada.punto[0],
            "lng": v.parada.punto[1],
            "llegada_min": v.llegada_min,
            "servicio_min": v.parada.servicio_min,
            "urgente": v.parada.urgente,
            "requiere_canasta": v.parada.requiere_canasta,
        }

    vehiculos_de = {r.id: r.vehiculos for r in payload.rutas}
    return {
        "sede": {"lat": sede[0], "lng": sede[1]},
        "jornada_min": jornada,
        "hora_inicio": config.hora_inicio_jornada.strftime("%H:%M")
        if config.hora_inicio_jornada
        else None,
        "fuente_tiempos": resultado.fuente_tiempos,
        "rutas": [
            {
                "id": r.id,
                "vehiculos": vehiculos_de[r.id],
                "visitas": [visita(v) for v in r.visitas],
                "minutos_viaje": r.minutos_viaje,
                "minutos_servicio": r.minutos_servicio,
                "minutos_total": r.minutos_total,
                "geometria": _geometria([sede, *(v.parada.punto for v in r.visitas), sede])
                if r.visitas
                else [],
            }
            for r in resultado.rutas
        ],
        "no_asignadas": [
            {
                "solicitud_id": p.id,
                "display_id": solicitudes[p.id].display_id,
                "equipo": solicitudes[p.id].equipo.codigo,
                "lat": p.punto[0],
                "lng": p.punto[1],
                "urgente": p.urgente,
                "motivo": motivo,
            }
            for p, motivo in resultado.no_asignadas
        ],
    }


@router.get("/rutas-del-dia", response=RutasDelDiaOut)
def rutas_del_dia(request, fecha: date | None = None):
    """Órdenes del día (o con trabajos aún pendientes) con su trazado, para el mapa."""
    exigir_permiso(request, "operations.view_ordendetrabajo")
    fecha = fecha or timezone.localdate()
    config = Configuracion.get_solo()
    sede = config.sede_central_ubicacion
    ordenes = (
        OrdenDeTrabajo.objects.filter(
            Q(fecha_creacion__date=fecha)
            | Q(fecha_creacion__date__lt=fecha, trabajos__estado=Trabajo.Estado.PENDIENTE)
        )
        .distinct()
        .prefetch_related(
            Prefetch(
                "trabajos", queryset=Trabajo.objects.select_related("equipo").order_by("secuencia")
            ),
            Prefetch(
                "unidades_asignadas",
                queryset=OTUnidadAsignada.objects.select_related("vehiculo").prefetch_related(
                    "tecnicos"
                ),
            ),
        )
    )
    rutas = []
    for o in ordenes:
        trabajos = list(o.trabajos.all())
        puntos = [(t.equipo.ubicacion.y, t.equipo.ubicacion.x) for t in trabajos]
        if sede:
            puntos = [(sede.y, sede.x), *puntos, (sede.y, sede.x)]
        unidades = list(o.unidades_asignadas.all())
        rutas.append(
            {
                "orden_id": o.pk,
                "display_id": o.display_id,
                "estado_general": o.estado_general,
                "placas": [u.vehiculo.placa for u in unidades],
                "tecnicos": [t.nombre for u in unidades for t in u.tecnicos.all()],
                "trabajos": [
                    {
                        "id": t.pk,
                        "secuencia": t.secuencia,
                        "estado": t.estado,
                        "equipo": t.equipo.codigo,
                        "lat": t.equipo.ubicacion.y,
                        "lng": t.equipo.ubicacion.x,
                    }
                    for t in trabajos
                ],
                "geometria": _geometria(puntos) if len(puntos) > 1 else [],
            }
        )
    return {"sede": {"lat": sede.y, "lng": sede.x} if sede else None, "rutas": rutas}
