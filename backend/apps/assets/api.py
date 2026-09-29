from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import D
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.pagination import PageNumberPagination, paginate
from ninja.responses import Status

from apps.core.permisos import exigir_permiso

from . import services
from .models import Equipo, Vehiculo
from .schemas import (
    EquipoDetalleOut,
    EquipoIn,
    EquipoOut,
    EquipoPatch,
    ResultadoLote,
    VehiculoIn,
    VehiculoOut,
    VehiculoPatch,
)

router = Router(tags=["activos"])

# --- Vehículos ----------------------------------------------------------------


def _vehiculos():
    return Vehiculo.objects.select_related("tipo", "estado")


@router.get("/vehiculos", response=list[VehiculoOut])
def listar_vehiculos(request, estado: str | None = None, tipo: str | None = None):
    exigir_permiso(request, "assets.view_vehiculo")
    qs = _vehiculos()
    if estado:
        qs = qs.filter(estado__valor=estado)
    if tipo:
        qs = qs.filter(tipo__valor=tipo)
    return qs


@router.get("/vehiculos/{codigo}", response=VehiculoOut)
def obtener_vehiculo(request, codigo: str):
    exigir_permiso(request, "assets.view_vehiculo")
    return get_object_or_404(_vehiculos(), codigo=codigo)


@router.post("/vehiculos", response={201: VehiculoOut})
def crear_vehiculo(request, payload: VehiculoIn):
    exigir_permiso(request, "assets.add_vehiculo")
    return Status(201, services.guardar_vehiculo(Vehiculo(), payload.dict()))


@router.patch("/vehiculos/{codigo}", response=VehiculoOut)
def editar_vehiculo(request, codigo: str, payload: VehiculoPatch):
    exigir_permiso(request, "assets.change_vehiculo")
    vehiculo = get_object_or_404(Vehiculo, codigo=codigo)
    return services.guardar_vehiculo(vehiculo, payload.dict(exclude_unset=True))


@router.delete("/vehiculos/{codigo}", response={204: None})
def borrar_vehiculo(request, codigo: str):
    exigir_permiso(request, "assets.delete_vehiculo")
    get_object_or_404(Vehiculo, codigo=codigo).delete()
    return Status(204, None)


# --- Equipos ------------------------------------------------------------------


def _equipos():
    return Equipo.objects.select_related("tipo", "marca", "zona", "estado")


@router.get("/equipos", response=list[EquipoOut])
@paginate(PageNumberPagination, page_size=50)
def listar_equipos(
    request,
    tipo: str | None = None,
    marca: str | None = None,
    zona: str | None = None,
    estado: str | None = None,
    q: str = "",
    cerca_lat: float | None = None,
    cerca_lng: float | None = None,
    radio_m: float = 1000,
    bbox: str | None = None,
):
    """Filtros opcionales. `cerca_*` ordena por distancia; `bbox` = oeste,sur,este,norte."""
    exigir_permiso(request, "assets.view_equipo")
    qs = _equipos()
    for campo, valor in (("tipo", tipo), ("marca", marca), ("zona", zona), ("estado", estado)):
        if valor:
            qs = qs.filter(**{f"{campo}__valor": valor})
    if q:
        qs = qs.filter(Q(codigo__icontains=q) | Q(direccion__icontains=q))
    if bbox:
        oeste, sur, este, norte = (float(v) for v in bbox.split(","))
        qs = qs.filter(ubicacion__within=Polygon.from_bbox((oeste, sur, este, norte)))
    if cerca_lat is not None and cerca_lng is not None:
        punto = Point(cerca_lng, cerca_lat, srid=4326)
        # Prefiltro en grados (usa el índice espacial) y filtro exacto en metros.
        margen_grados = radio_m / 111_000 * 1.5
        qs = (
            qs.filter(ubicacion__dwithin=(punto, margen_grados))
            .filter(ubicacion__distance_lte=(punto, D(m=radio_m)))
            .annotate(distancia=Distance("ubicacion", punto))
            .order_by("distancia")
        )
    return qs


@router.get("/equipos/mapa")
def mapa_equipos(request, estado: str | None = None):
    """GeoJSON ligero de todos los equipos para pintarlos en MapLibre."""
    exigir_permiso(request, "assets.view_equipo")
    qs = Equipo.objects.values(
        "codigo", "ubicacion", "tipo__valor", "marca__valor", "zona__valor", "estado__valor"
    )
    if estado:
        qs = qs.filter(estado__valor=estado)
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": e["codigo"],
                "geometry": {"type": "Point", "coordinates": [e["ubicacion"].x, e["ubicacion"].y]},
                "properties": {
                    "codigo": e["codigo"],
                    "tipo": e["tipo__valor"],
                    "marca": e["marca__valor"],
                    "zona": e["zona__valor"],
                    "estado": e["estado__valor"],
                },
            }
            for e in qs
        ],
    }


# Debe declararse antes de /equipos/{codigo} para que esa ruta no la capture.
@router.post("/equipos/lote", response=ResultadoLote)
def importar_equipos(request, payload: list[EquipoIn]):
    """Crea o actualiza equipos por `codigo` (importación desde CSV/Excel)."""
    exigir_permiso(request, "assets.add_equipo", "assets.change_equipo")
    creados = actualizados = 0
    errores = []
    for item in payload:
        datos = item.dict()
        try:
            with transaction.atomic():
                existente = Equipo.objects.filter(codigo=item.codigo).first()
                if existente:
                    services.actualizar_equipo(existente, datos, request.user)
                    actualizados += 1
                else:
                    services.crear_equipo(datos, request.user)
                    creados += 1
        except ValidationError as e:
            errores.append({"codigo": item.codigo, "error": "; ".join(e.messages)})
    return {"creados": creados, "actualizados": actualizados, "errores": errores}


@router.get("/equipos/{codigo}", response=EquipoDetalleOut)
def obtener_equipo(request, codigo: str):
    exigir_permiso(request, "assets.view_equipo")
    return get_object_or_404(_equipos().prefetch_related("estado_historial__estado"), codigo=codigo)


@router.post("/equipos", response={201: EquipoDetalleOut})
def crear_equipo(request, payload: EquipoIn):
    exigir_permiso(request, "assets.add_equipo")
    equipo = services.crear_equipo(payload.dict(), request.user)
    return Status(201, obtener_equipo(request, equipo.codigo))


@router.patch("/equipos/{codigo}", response=EquipoDetalleOut)
def editar_equipo(request, codigo: str, payload: EquipoPatch):
    exigir_permiso(request, "assets.change_equipo")
    equipo = get_object_or_404(Equipo, codigo=codigo)
    services.actualizar_equipo(equipo, payload.dict(exclude_unset=True), request.user)
    return obtener_equipo(request, codigo)


@router.delete("/equipos/{codigo}", response={204: None})
def borrar_equipo(request, codigo: str):
    """Falla con 409 si el equipo tiene solicitudes; en ese caso, darlo de baja."""
    exigir_permiso(request, "assets.delete_equipo")
    get_object_or_404(Equipo, codigo=codigo).delete()
    return Status(204, None)
