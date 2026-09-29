from django.contrib.gis.geos import Point
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.catalogs.models import EstadoEquipo, EstadoVehiculo, Marca, TipoEquipo, TipoVehiculo, Zona

from .models import Equipo, EquipoEstadoHistorial, Vehiculo

CATALOGOS_EQUIPO = {"tipo": TipoEquipo, "marca": Marca, "zona": Zona, "estado": EstadoEquipo}
CATALOGOS_VEHICULO = {"tipo": TipoVehiculo, "estado": EstadoVehiculo}


def resolver_catalogos(datos: dict, catalogos: dict) -> dict:
    """Sustituye los valores de catálogo ("honeywell") por sus instancias."""
    for campo, modelo in catalogos.items():
        if campo in datos and datos[campo] is not None:
            try:
                datos[campo] = modelo.objects.get(valor=datos[campo])
            except modelo.DoesNotExist:
                raise ValidationError({campo: f"Valor desconocido: {datos[campo]}"}) from None
    return datos


def _aplicar_ubicacion(datos: dict, equipo: Equipo | None = None) -> dict:
    lat, lng = datos.pop("lat", None), datos.pop("lng", None)
    if lat is not None or lng is not None:
        lat = lat if lat is not None else equipo.ubicacion.y
        lng = lng if lng is not None else equipo.ubicacion.x
        datos["ubicacion"] = Point(lng, lat, srid=4326)
    return datos


@transaction.atomic
def crear_equipo(datos: dict, usuario) -> Equipo:
    motivo = datos.pop("motivo_estado", "") or "Alta del equipo"
    datos = _aplicar_ubicacion(resolver_catalogos(dict(datos), CATALOGOS_EQUIPO))
    equipo = Equipo(**datos)
    equipo.full_clean()
    equipo.save()
    EquipoEstadoHistorial.objects.create(
        equipo=equipo, estado=equipo.estado, modificado_por=usuario, motivo=motivo
    )
    return equipo


@transaction.atomic
def actualizar_equipo(equipo: Equipo, datos: dict, usuario) -> Equipo:
    motivo = datos.pop("motivo_estado", "")
    estado_anterior = equipo.estado_id
    datos = _aplicar_ubicacion(resolver_catalogos(dict(datos), CATALOGOS_EQUIPO), equipo)
    for campo, valor in datos.items():
        setattr(equipo, campo, valor)
    equipo.full_clean()
    equipo.save()
    if equipo.estado_id != estado_anterior:
        EquipoEstadoHistorial.objects.create(
            equipo=equipo, estado=equipo.estado, modificado_por=usuario, motivo=motivo
        )
    return equipo


def guardar_vehiculo(vehiculo: Vehiculo, datos: dict) -> Vehiculo:
    for campo, valor in resolver_catalogos(dict(datos), CATALOGOS_VEHICULO).items():
        setattr(vehiculo, campo, valor)
    vehiculo.full_clean()
    vehiculo.save()
    return vehiculo
