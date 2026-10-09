from datetime import date, datetime
from typing import Any

from ninja import Schema
from pydantic import Field


class VehiculoOut(Schema):
    codigo: str
    placa: str
    tipo: str
    estado: str
    custodio_id: int | None

    @staticmethod
    def resolve_tipo(obj):
        return obj.tipo.valor

    @staticmethod
    def resolve_estado(obj):
        return obj.estado.valor


class VehiculoIn(Schema):
    codigo: str = Field(min_length=1, max_length=50)
    placa: str = Field(min_length=1, max_length=15)
    tipo: str
    estado: str
    custodio_id: int | None = None


class VehiculoPatch(Schema):
    placa: str | None = None
    tipo: str | None = None
    estado: str | None = None
    custodio_id: int | None = None


class EquipoBase(Schema):
    tipo: str
    marca: str
    zona: str
    estado: str
    direccion: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    ip: str | None = None
    tipo_comunicacion: str = "Celular"
    piloto: str = ""
    fecha_fabricacion: date | None = None
    requiere_canasta: bool = False
    zona_peligrosa: bool = False
    proximo_mantenimiento_programado: date | None = None
    intervalo_mantenimiento_dias: int | None = None
    intervalo_mantenimiento_revisiones: int | None = None
    campos_adicionales: dict[str, Any] = {}


class EquipoIn(EquipoBase):
    codigo: str = Field(min_length=1, max_length=50)
    # Solo para importaciones masivas de datos históricos.
    fecha_ultima_revision: datetime | None = None
    revision_count: int = 0
    motivo_estado: str = ""


class EquipoPatch(Schema):
    tipo: str | None = None
    marca: str | None = None
    zona: str | None = None
    estado: str | None = None
    motivo_estado: str = ""
    direccion: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    ip: str | None = None
    tipo_comunicacion: str | None = None
    piloto: str | None = None
    fecha_fabricacion: date | None = None
    requiere_canasta: bool | None = None
    zona_peligrosa: bool | None = None
    proximo_mantenimiento_programado: date | None = None
    intervalo_mantenimiento_dias: int | None = None
    intervalo_mantenimiento_revisiones: int | None = None
    campos_adicionales: dict[str, Any] | None = None


class EquipoOut(Schema):
    codigo: str
    tipo: str
    marca: str
    zona: str
    estado: str
    direccion: str
    lat: float
    lng: float
    ip: str | None
    tipo_comunicacion: str
    piloto: str
    fecha_fabricacion: date | None
    fecha_ultima_revision: datetime | None
    revision_count: int
    requiere_canasta: bool
    zona_peligrosa: bool
    proximo_mantenimiento_programado: date | None
    intervalo_mantenimiento_dias: int | None
    intervalo_mantenimiento_revisiones: int | None
    campos_adicionales: dict[str, Any]
    distancia_m: float | None = None

    @staticmethod
    def resolve_tipo(obj):
        return obj.tipo.valor

    @staticmethod
    def resolve_marca(obj):
        return obj.marca.valor

    @staticmethod
    def resolve_zona(obj):
        return obj.zona.valor

    @staticmethod
    def resolve_estado(obj):
        return obj.estado.valor

    @staticmethod
    def resolve_lat(obj):
        return obj.ubicacion.y

    @staticmethod
    def resolve_lng(obj):
        return obj.ubicacion.x

    @staticmethod
    def resolve_distancia_m(obj):
        distancia = getattr(obj, "distancia", None)
        return round(distancia.m, 1) if distancia is not None else None


class EquipoHistorialOut(Schema):
    estado: str
    fecha: datetime
    modificado_por_id: int | None
    motivo: str

    @staticmethod
    def resolve_estado(obj):
        return obj.estado.valor


class EquipoDetalleOut(EquipoOut):
    estado_historial: list[EquipoHistorialOut]

    @staticmethod
    def resolve_estado_historial(obj):
        return list(obj.estado_historial.all())


class ErrorLote(Schema):
    codigo: str
    error: str


class ResultadoLote(Schema):
    creados: int
    actualizados: int
    errores: list[ErrorLote]
