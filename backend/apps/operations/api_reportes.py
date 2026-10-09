from datetime import date

from ninja import Query, Router, Schema

from apps.accounts.roles import Rol
from apps.core.permisos import exigir

from . import reportes

router = Router(tags=["reportes"])


class SolicitudesMes(Schema):
    mes: str
    solicitudes_creadas: int
    trabajos_completados: int
    porcentaje_exito: float | None


class FilaProductividad(Schema):
    mes: str
    por_tipo: dict[str, int]
    total: int


class Productividad(Schema):
    tipos: list[str]
    filas: list[FilaProductividad]


class FilaRanking(Schema):
    equipo: str
    tipo_equipo: str
    total: int
    no_completados: int
    por_tipo: dict[str, int]


class Ranking(Schema):
    tipos: list[str]
    filas: list[FilaRanking]


class FilaTecnico(Schema):
    tecnico_id: int
    nombre: str
    atendidos: int
    completados: int
    no_completados: int
    efectividad: float
    por_tipo: dict[str, int]


class EstadisticasTecnicos(Schema):
    tipos: list[str]
    filas: list[FilaTecnico]


def _puede_ver(request):
    exigir(request.user.has_role(Rol.ADMINISTRADOR, Rol.SUPERVISOR))


@router.get("/solicitudes-mensual", response=list[SolicitudesMes])
def solicitudes_mensual(request, desde: date, hasta: date):
    _puede_ver(request)
    return reportes.solicitudes_mensual(desde, hasta)


@router.get("/productividad-mensual", response=Productividad)
def productividad_mensual(request, desde: date, hasta: date):
    _puede_ver(request)
    return reportes.productividad_mensual(desde, hasta)


@router.get("/ranking-equipos", response=Ranking)
def ranking_equipos(
    request, desde: date, hasta: date, tipo_equipo: list[str] = Query(None), limite: int = 100
):
    _puede_ver(request)
    return reportes.ranking_equipos(desde, hasta, tipo_equipo, min(limite, 1000))


@router.get("/tecnicos", response=EstadisticasTecnicos)
def estadisticas_tecnicos(request, desde: date, hasta: date):
    _puede_ver(request)
    return reportes.estadisticas_tecnicos(desde, hasta)
