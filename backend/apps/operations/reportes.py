"""Reportes agregados en SQL (antes se calculaban en el navegador con todas las colecciones).

Diferencias intencionadas con la versión anterior:
- Los conteos por tipo de trabajo usan los tipos reales del catálogo; antes
  estaban fijos en el código ("Revisión de comunicación", "Mantenimiento"...)
  y cualquier tipo nuevo quedaba fuera.
- Un trabajo cancelado no cuenta como intervención atendida.
"""

from collections import defaultdict
from datetime import date

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from .models import Solicitud, Trabajo

User = get_user_model()
T = Trabajo.Estado
ATENDIDOS = (T.COMPLETADO, T.NO_COMPLETADO)


def _mes(fecha) -> str:
    # TruncMonth ya devuelve el inicio de mes en la zona horaria local.
    return timezone.localtime(fecha).strftime("%Y-%m")


def _finalizados(desde: date, hasta: date):
    return Trabajo.objects.filter(
        estado__in=ATENDIDOS,
        fecha_finalizacion__date__gte=desde,
        fecha_finalizacion__date__lte=hasta,
    )


def solicitudes_mensual(desde: date, hasta: date) -> list[dict]:
    """Solicitudes creadas vs. trabajos completados por mes, con % de éxito."""
    filas: dict[str, dict] = defaultdict(
        lambda: {"solicitudes_creadas": 0, "trabajos_completados": 0}
    )
    creadas = (
        Solicitud.objects.filter(fecha_solicitud__date__gte=desde, fecha_solicitud__date__lte=hasta)
        .annotate(mes=TruncMonth("fecha_solicitud"))
        .values("mes")
        .annotate(n=Count("id"))
    )
    for r in creadas:
        filas[_mes(r["mes"])]["solicitudes_creadas"] = r["n"]
    completados = (
        _finalizados(desde, hasta)
        .filter(estado=T.COMPLETADO)
        .annotate(mes=TruncMonth("fecha_finalizacion"))
        .values("mes")
        .annotate(n=Count("id"))
    )
    for r in completados:
        filas[_mes(r["mes"])]["trabajos_completados"] = r["n"]
    return [
        {
            "mes": mes,
            **f,
            "porcentaje_exito": (
                round(f["trabajos_completados"] * 100 / f["solicitudes_creadas"], 1)
                if f["solicitudes_creadas"]
                else None
            ),
        }
        for mes, f in sorted(filas.items())
    ]


def productividad_mensual(desde: date, hasta: date) -> dict:
    """Trabajos completados por mes y tipo de trabajo."""
    datos = (
        _finalizados(desde, hasta)
        .filter(estado=T.COMPLETADO)
        .annotate(mes=TruncMonth("fecha_finalizacion"))
        .values("mes", "tipo_trabajo__nombre")
        .annotate(n=Count("id"))
    )
    filas: dict[str, dict[str, int]] = defaultdict(dict)
    tipos: set[str] = set()
    for r in datos:
        filas[_mes(r["mes"])][r["tipo_trabajo__nombre"]] = r["n"]
        tipos.add(r["tipo_trabajo__nombre"])
    return {
        "tipos": sorted(tipos),
        "filas": [
            {"mes": mes, "por_tipo": por_tipo, "total": sum(por_tipo.values())}
            for mes, por_tipo in sorted(filas.items())
        ],
    }


def ranking_equipos(
    desde: date, hasta: date, tipos_equipo: list[str] | None = None, limite: int = 100
) -> dict:
    """Equipos con más intervenciones (completadas o no) en el periodo."""
    qs = _finalizados(desde, hasta)
    if tipos_equipo:
        qs = qs.filter(equipo__tipo__valor__in=tipos_equipo)
    datos = qs.values("equipo__codigo", "equipo__tipo__valor", "tipo_trabajo__nombre").annotate(
        n=Count("id"), no_completados=Count("id", filter=Q(estado=T.NO_COMPLETADO))
    )
    equipos: dict[str, dict] = {}
    tipos: set[str] = set()
    for r in datos:
        e = equipos.setdefault(
            r["equipo__codigo"],
            {
                "equipo": r["equipo__codigo"],
                "tipo_equipo": r["equipo__tipo__valor"],
                "total": 0,
                "no_completados": 0,
                "por_tipo": {},
            },
        )
        e["total"] += r["n"]
        e["no_completados"] += r["no_completados"]
        e["por_tipo"][r["tipo_trabajo__nombre"]] = r["n"]
        tipos.add(r["tipo_trabajo__nombre"])
    filas = sorted(equipos.values(), key=lambda e: (-e["total"], e["equipo"]))[:limite]
    return {"tipos": sorted(tipos), "filas": filas}


def estadisticas_tecnicos(desde: date, hasta: date) -> dict:
    """Trabajos atendidos por cada técnico asignado a la orden, con su efectividad."""
    datos = (
        _finalizados(desde, hasta)
        .values("orden__unidades_asignadas__tecnicos", "tipo_trabajo__nombre")
        .annotate(
            n=Count("id", distinct=True),
            completados=Count("id", filter=Q(estado=T.COMPLETADO), distinct=True),
        )
        .exclude(orden__unidades_asignadas__tecnicos=None)
    )
    por_tecnico: dict[int, dict] = {}
    tipos: set[str] = set()
    for r in datos:
        t = por_tecnico.setdefault(
            r["orden__unidades_asignadas__tecnicos"],
            {"atendidos": 0, "completados": 0, "por_tipo": {}},
        )
        t["atendidos"] += r["n"]
        t["completados"] += r["completados"]
        t["por_tipo"][r["tipo_trabajo__nombre"]] = r["n"]
        tipos.add(r["tipo_trabajo__nombre"])
    nombres = dict(User.objects.filter(pk__in=por_tecnico).values_list("pk", "nombre"))
    filas = [
        {
            "tecnico_id": pk,
            "nombre": nombres.get(pk, str(pk)),
            **t,
            "no_completados": t["atendidos"] - t["completados"],
            "efectividad": round(t["completados"] * 100 / t["atendidos"], 1),
        }
        for pk, t in por_tecnico.items()
    ]
    filas.sort(key=lambda f: (-f["atendidos"], f["nombre"]))
    return {"tipos": sorted(tipos), "filas": filas}
