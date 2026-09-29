from datetime import date, datetime
from typing import Any, Literal

from ninja import Schema
from pydantic import Field

# --- Solicitudes ------------------------------------------------------------------


class SolicitudOut(Schema):
    id: int
    display_id: str
    equipo: str
    fecha_solicitud: datetime
    fecha_programada: date
    tipo_trabajo_id: int
    tipo_trabajo_nombre: str
    tiempo_servicio_estimado: int | None
    urgencia: str
    descripcion: str
    creado_por_id: int
    creado_por_nombre: str
    estado: str
    motivo_cancelacion: str

    @staticmethod
    def resolve_equipo(obj):
        return obj.equipo.codigo

    @staticmethod
    def resolve_tipo_trabajo_nombre(obj):
        return obj.tipo_trabajo.nombre

    @staticmethod
    def resolve_urgencia(obj):
        return obj.urgencia.valor

    @staticmethod
    def resolve_creado_por_nombre(obj):
        return obj.creado_por.nombre


class SolicitudIn(Schema):
    equipo: str
    tipo_trabajo_id: int
    urgencia: str
    fecha_programada: date
    tiempo_servicio_estimado: int | None = Field(default=None, gt=0)
    descripcion: str = ""


class SolicitudPatch(Schema):
    tipo_trabajo_id: int | None = None
    urgencia: str | None = None
    fecha_programada: date | None = None
    tiempo_servicio_estimado: int | None = Field(default=None, gt=0)
    descripcion: str | None = None


class MotivoIn(Schema):
    motivo: str = Field(min_length=1)


# --- Unidades de campo -----------------------------------------------------------


class UnidadCampoSchema(Schema):
    vehiculo: str
    tecnicos: list[int]


# --- Órdenes y trabajos ---------------------------------------------------------


class TecnicoRef(Schema):
    id: int
    nombre: str


class UnidadAsignadaIn(Schema):
    ruta_id: str = ""
    vehiculo: str
    tecnicos: list[int] = Field(min_length=1)


class OrdenIn(Schema):
    unidades: list[UnidadAsignadaIn] = Field(min_length=1)
    # IDs de solicitudes pendientes, en el orden de la ruta.
    solicitudes: list[int] = Field(min_length=1)


class UnidadAsignadaOut(Schema):
    ruta_id: str
    vehiculo: str
    placa: str
    tecnicos: list[TecnicoRef]

    @staticmethod
    def resolve_vehiculo(obj):
        return obj.vehiculo.codigo

    @staticmethod
    def resolve_placa(obj):
        return obj.vehiculo.placa

    @staticmethod
    def resolve_tecnicos(obj):
        return list(obj.tecnicos.all())


class EquipoResumen(Schema):
    codigo: str
    direccion: str
    lat: float
    lng: float
    tipo: str
    marca: str
    zona: str
    requiere_canasta: bool
    zona_peligrosa: bool

    @staticmethod
    def resolve_lat(obj):
        return obj.ubicacion.y

    @staticmethod
    def resolve_lng(obj):
        return obj.ubicacion.x

    @staticmethod
    def resolve_tipo(obj):
        return obj.tipo.valor

    @staticmethod
    def resolve_marca(obj):
        return obj.marca.valor

    @staticmethod
    def resolve_zona(obj):
        return obj.zona.valor


class FotoOut(Schema):
    id: int
    url: str
    subida_en: datetime

    @staticmethod
    def resolve_url(obj):
        return obj.imagen.url


class TrabajoOut(Schema):
    id: int
    codigo: str
    secuencia: int
    orden_id: int
    orden_display_id: str
    equipo: EquipoResumen
    solicitud_id: int
    solicitud_display_id: str
    tipo_trabajo_id: int
    tipo_trabajo_nombre: str
    tiempo_servicio_estimado: int | None
    estado: str
    detalles: str
    hallazgos: str
    completado_por_id: int | None
    fecha_finalizacion: datetime | None
    observacion_ingeniero: str
    observacion_ingeniero_por_id: int | None
    fecha_observacion_ingeniero: datetime | None
    requiere_nueva_revision: bool
    fecha_nueva_revision: date | None
    motivo_cancelacion: str
    fotos: list[FotoOut]

    @staticmethod
    def resolve_orden_display_id(obj):
        return obj.orden.display_id

    @staticmethod
    def resolve_solicitud_display_id(obj):
        return obj.solicitud.display_id

    @staticmethod
    def resolve_tipo_trabajo_nombre(obj):
        return obj.tipo_trabajo.nombre

    @staticmethod
    def resolve_fotos(obj):
        return list(obj.fotos.all())


class OrdenOut(Schema):
    id: int
    display_id: str
    fecha_creacion: datetime
    creado_por_id: int
    creado_por_nombre: str
    estado_general: str
    unidades: list[UnidadAsignadaOut]
    trabajos_por_estado: dict[str, int]

    @staticmethod
    def resolve_creado_por_nombre(obj):
        return obj.creado_por.nombre

    @staticmethod
    def resolve_unidades(obj):
        return list(obj.unidades_asignadas.all())

    @staticmethod
    def resolve_trabajos_por_estado(obj):
        conteo: dict[str, int] = {}
        for t in obj.trabajos.all():
            conteo[t.estado] = conteo.get(t.estado, 0) + 1
        return conteo


class OrdenDetalleOut(OrdenOut):
    trabajos: list[TrabajoOut]

    @staticmethod
    def resolve_trabajos(obj):
        return list(obj.trabajos.all())


class ReporteIn(Schema):
    """Lo que envía el técnico al cerrar un trabajo."""

    estado: Literal["Completado", "No Completado"]
    detalles: str = ""
    hallazgos: str = ""


class RevisionIn(Schema):
    """Revisión del ingeniero o supervisor; todos los campos son opcionales."""

    estado: Literal["Pendiente", "Completado", "No Completado"] | None = None
    observacion: str | None = None
    requiere_nueva_revision: bool | None = None
    fecha_nueva_revision: date | None = None


# --- Planes de mantenimiento ----------------------------------------------------


class MantenimientoIn(Schema):
    equipo: str
    fecha_programada: date
    motivo_prioridad: str = ""


class MantenimientoOut(Schema):
    id: int
    equipo: str
    fecha_programada: date
    solicitud_id: int | None
    estado: str
    motivo_prioridad: str

    @staticmethod
    def resolve_equipo(obj):
        return obj.equipo.codigo


class ExclusionIn(Schema):
    campo: Literal["tipo", "marca", "zona", "zonaPeligrosa"]
    operador: Literal["es", "no_es"]
    valor: bool | str


class PlanIn(Schema):
    nombre: str = Field(min_length=1)
    tiempo_de_ejecucion_dias: int = Field(gt=0)
    exclusiones: list[ExclusionIn] = []
    estado: Literal["borrador", "activo", "completado", "archivado"] = "borrador"
    estadisticas: dict[str, Any] = {}
    calendario: list[MantenimientoIn] = []


class PlanPatch(Schema):
    nombre: str | None = None
    estado: Literal["borrador", "activo", "completado", "archivado"] | None = None


class PlanOut(Schema):
    id: int
    nombre: str
    fecha_creacion: datetime
    creado_por_id: int
    tiempo_de_ejecucion_dias: int
    exclusiones: list[dict[str, Any]]
    estado: str
    estadisticas: dict[str, Any]


class PlanDetalleOut(PlanOut):
    calendario: list[MantenimientoOut]

    @staticmethod
    def resolve_calendario(obj):
        return list(obj.calendario.all())


class GenerarPlanIn(Schema):
    """Parámetros del planificador de reglas fijas."""

    nombre: str = Field(min_length=1)
    tiempo_de_ejecucion_dias: int = Field(gt=0, description="Días hábiles del plan")
    exclusiones: list[ExclusionIn] = []
    fecha_inicio: date | None = None  # por defecto, hoy


class ProgramacionOut(Schema):
    equipo: str
    fecha_programada: date
    motivo_prioridad: str

    @staticmethod
    def resolve_equipo(obj):
        return obj.equipo.codigo


class PrevisualizacionOut(Schema):
    total_equipos_considerados: int
    total_equipos_excluidos: int
    calendario: list[ProgramacionOut]


class GenerarSolicitudesIn(Schema):
    items: list[int] | None = None  # None = todos los programados
    # Se crea en cada tipo de equipo si aún no existe.
    tipo_trabajo: str = "Mantenimiento preventivo"
    urgencia: str = "normal"


class GenerarSolicitudesOut(Schema):
    creadas: int
    errores: list[str]


class KpisOut(Schema):
    ordenes_del_dia: int
    trabajos_pendientes_total: int
    trabajos_completados_hoy: int
    trabajos_pendientes_creados_hoy: int
    trabajos_no_completados_creados_hoy: int
    solicitudes_pendientes: int
