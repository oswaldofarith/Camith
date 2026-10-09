from datetime import time
from typing import Literal

from django.contrib.gis.geos import Point
from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.responses import Status
from pydantic import Field

from apps.core.permisos import exigir_permiso
from apps.core.schemas import Punto

from . import models

router = Router(tags=["catálogos"])

# Catálogos simples (valor/etiqueta) expuestos por la API.
CATALOGOS = {
    "marcas": models.Marca,
    "zonas": models.Zona,
    "tipos-equipo": models.TipoEquipo,
    "estados-equipo": models.EstadoEquipo,
    "tipos-vehiculo": models.TipoVehiculo,
    "estados-vehiculo": models.EstadoVehiculo,
    "urgencias": models.Urgencia,
    "respuestas-predefinidas": models.RespuestaPredefinida,
}
NombreCatalogo = Literal[
    "marcas",
    "zonas",
    "tipos-equipo",
    "estados-equipo",
    "tipos-vehiculo",
    "estados-vehiculo",
    "urgencias",
    "respuestas-predefinidas",
]


class ItemOut(Schema):
    valor: str
    etiqueta: str
    activo: bool
    orden: int


class ItemIn(Schema):
    valor: str
    etiqueta: str
    activo: bool = True
    orden: int = 0


class ItemPatch(Schema):
    etiqueta: str | None = None
    activo: bool | None = None
    orden: int | None = None


class TipoTrabajoOut(Schema):
    id: int
    tipo_equipo: str
    nombre: str
    tiempo_estimado_minutos: int
    activo: bool

    @staticmethod
    def resolve_tipo_equipo(obj):
        return obj.tipo_equipo.valor


class TipoTrabajoIn(Schema):
    tipo_equipo: str
    nombre: str
    tiempo_estimado_minutos: int = 30
    activo: bool = True


class TipoTrabajoPatch(Schema):
    nombre: str | None = None
    tiempo_estimado_minutos: int | None = None
    activo: bool | None = None


class LocalidadOut(Schema):
    id: int
    nombre: str
    lat: float
    lng: float

    @staticmethod
    def resolve_lat(obj):
        return obj.ubicacion.y

    @staticmethod
    def resolve_lng(obj):
        return obj.ubicacion.x


class LocalidadIn(Schema):
    nombre: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ConfiguracionSchema(Schema):
    empresa_nombre: str = ""
    empresa_unidad_negocio: str = ""
    empresa_departamento: str = ""
    sede_central_nombre: str = ""
    sede_central: Punto | None = None
    hora_inicio_jornada: time | None = None
    hora_fin_jornada: time | None = None
    minutos_planificacion: int = 0
    minutos_reporte: int = 0
    minutos_almuerzo: int = 60
    hora_inicio_almuerzo: time | None = None
    hora_fin_almuerzo: time | None = None


def _config_out(config: models.Configuracion) -> ConfiguracionSchema:
    datos = {
        campo: getattr(config, campo)
        for campo in ConfiguracionSchema.model_fields
        if campo != "sede_central"
    }
    ubicacion = config.sede_central_ubicacion
    datos["sede_central"] = Punto(lat=ubicacion.y, lng=ubicacion.x) if ubicacion else None
    return ConfiguracionSchema(**datos)


class TipoEquipoConTrabajos(ItemOut):
    tipos_trabajo: list[TipoTrabajoOut]

    @staticmethod
    def resolve_tipos_trabajo(obj):
        return list(obj.tipos_de_trabajo.all())


class CatalogosOut(Schema):
    marcas: list[ItemOut]
    zonas: list[ItemOut]
    tipos_equipo: list[TipoEquipoConTrabajos]
    estados_equipo: list[ItemOut]
    tipos_vehiculo: list[ItemOut]
    estados_vehiculo: list[ItemOut]
    urgencias: list[ItemOut]
    respuestas_predefinidas: list[ItemOut]
    localidades: list[LocalidadOut]
    configuracion: ConfiguracionSchema


@router.get("", response=CatalogosOut)
def todos(request):
    """Todos los catálogos y la configuración en una sola respuesta."""
    datos = {
        nombre.replace("-", "_"): list(modelo.objects.all())
        for nombre, modelo in CATALOGOS.items()
        if nombre != "tipos-equipo"
    }
    datos["tipos_equipo"] = list(
        models.TipoEquipo.objects.prefetch_related("tipos_de_trabajo__tipo_equipo")
    )
    datos["localidades"] = list(models.Localidad.objects.all())
    datos["configuracion"] = _config_out(models.Configuracion.get_solo())
    return datos


# --- Configuración general ----------------------------------------------------


@router.put("/configuracion", response=ConfiguracionSchema)
def guardar_configuracion(request, payload: ConfiguracionSchema):
    exigir_permiso(request, "catalogs.change_configuracion")
    config = models.Configuracion.get_solo()
    datos = payload.dict()
    sede = datos.pop("sede_central")
    for campo, valor in datos.items():
        setattr(config, campo, valor)
    config.sede_central_ubicacion = Point(sede["lng"], sede["lat"], srid=4326) if sede else None
    config.full_clean()
    config.save()
    return _config_out(config)


# --- Tipos de trabajo ---------------------------------------------------------


@router.post("/tipos-trabajo", response={201: TipoTrabajoOut})
def crear_tipo_trabajo(request, payload: TipoTrabajoIn):
    exigir_permiso(request, "catalogs.add_tipotrabajo")
    datos = payload.dict()
    datos["tipo_equipo"] = get_object_or_404(models.TipoEquipo, valor=datos["tipo_equipo"])
    obj = models.TipoTrabajo(**datos)
    obj.full_clean()
    obj.save()
    return Status(201, obj)


@router.patch("/tipos-trabajo/{int:tipo_id}", response=TipoTrabajoOut)
def editar_tipo_trabajo(request, tipo_id: int, payload: TipoTrabajoPatch):
    exigir_permiso(request, "catalogs.change_tipotrabajo")
    obj = get_object_or_404(models.TipoTrabajo, pk=tipo_id)
    for campo, valor in payload.dict(exclude_unset=True).items():
        setattr(obj, campo, valor)
    obj.full_clean()
    obj.save()
    return obj


@router.delete("/tipos-trabajo/{int:tipo_id}", response={204: None})
def borrar_tipo_trabajo(request, tipo_id: int):
    exigir_permiso(request, "catalogs.delete_tipotrabajo")
    get_object_or_404(models.TipoTrabajo, pk=tipo_id).delete()
    return Status(204, None)


# --- Localidades --------------------------------------------------------------


@router.post("/localidades", response={201: LocalidadOut})
def crear_localidad(request, payload: LocalidadIn):
    exigir_permiso(request, "catalogs.add_localidad")
    obj = models.Localidad(
        nombre=payload.nombre, ubicacion=Point(payload.lng, payload.lat, srid=4326)
    )
    obj.full_clean()
    obj.save()
    return Status(201, obj)


@router.put("/localidades/{int:localidad_id}", response=LocalidadOut)
def editar_localidad(request, localidad_id: int, payload: LocalidadIn):
    exigir_permiso(request, "catalogs.change_localidad")
    obj = get_object_or_404(models.Localidad, pk=localidad_id)
    obj.nombre = payload.nombre
    obj.ubicacion = Point(payload.lng, payload.lat, srid=4326)
    obj.full_clean()
    obj.save()
    return obj


@router.delete("/localidades/{int:localidad_id}", response={204: None})
def borrar_localidad(request, localidad_id: int):
    exigir_permiso(request, "catalogs.delete_localidad")
    get_object_or_404(models.Localidad, pk=localidad_id).delete()
    return Status(204, None)


# --- Catálogos simples (al final: sus rutas capturan cualquier nombre) --------


def _modelo(catalogo: str):
    return CATALOGOS[catalogo]


@router.post("/{catalogo}", response={201: ItemOut})
def crear_item(request, catalogo: NombreCatalogo, payload: ItemIn):
    modelo = _modelo(catalogo)
    exigir_permiso(request, f"catalogs.add_{modelo._meta.model_name}")
    obj = modelo(**payload.dict())
    obj.full_clean()
    obj.save()
    return Status(201, obj)


@router.patch("/{catalogo}/{valor}", response=ItemOut)
def editar_item(request, catalogo: NombreCatalogo, valor: str, payload: ItemPatch):
    modelo = _modelo(catalogo)
    exigir_permiso(request, f"catalogs.change_{modelo._meta.model_name}")
    obj = get_object_or_404(modelo, valor=valor)
    for campo, v in payload.dict(exclude_unset=True).items():
        setattr(obj, campo, v)
    obj.full_clean()
    obj.save()
    return obj


@router.delete("/{catalogo}/{valor}", response={204: None})
def borrar_item(request, catalogo: NombreCatalogo, valor: str):
    """Falla con 409 si el valor está en uso; en ese caso, desactívelo."""
    modelo = _modelo(catalogo)
    exigir_permiso(request, f"catalogs.delete_{modelo._meta.model_name}")
    get_object_or_404(modelo, valor=valor).delete()
    return Status(204, None)
