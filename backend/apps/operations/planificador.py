"""Planificador de mantenimiento preventivo con reglas fijas (sin IA).

Réplica en el servidor de `frontend/src/ai/flows/maintenancePlanner.ts`, que ya
era lógica determinista, con dos correcciones: el operador `no_es` de las
exclusiones ahora funciona y cada mantenimiento indica su motivo concreto.

Reglas:
1. Solo equipos en estado "activo" que no cumplan ninguna exclusión.
2. Prioridad: primero los nunca revisados, luego la revisión más antigua, luego
   la fabricación más antigua y, a igualdad, el que acumula más revisiones.
3. Se reparten por igual entre los días hábiles (lunes a viernes) del plazo.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.core.exceptions import ValidationError
from django.db.models import QuerySet
from django.utils import timezone

from apps.assets.models import Equipo

CAMPOS_EXCLUIBLES = {"tipo", "marca", "zona", "zonaPeligrosa"}


@dataclass
class Programacion:
    equipo: Equipo
    fecha_programada: date
    motivo_prioridad: str


@dataclass
class ResultadoPlan:
    total_equipos_considerados: int
    total_equipos_excluidos: int
    calendario: list[Programacion]


def _valor(equipo: Equipo, campo: str):
    if campo == "zonaPeligrosa":
        return equipo.zona_peligrosa
    catalogo = getattr(equipo, campo)
    return {catalogo.valor.lower(), catalogo.etiqueta.lower()}


def _coincide(equipo: Equipo, exclusion: dict) -> bool:
    actual = _valor(equipo, exclusion["campo"])
    esperado = exclusion["valor"]
    if isinstance(actual, bool):
        if isinstance(esperado, str):
            esperado = esperado.strip().lower() in ("true", "sí", "si", "1")
        iguales = actual == bool(esperado)
    else:
        iguales = str(esperado).strip().lower() in actual
    return iguales if exclusion["operador"] == "es" else not iguales


def validar_exclusiones(exclusiones: list[dict]) -> None:
    for e in exclusiones:
        if e.get("campo") not in CAMPOS_EXCLUIBLES or e.get("operador") not in ("es", "no_es"):
            raise ValidationError(f"Exclusión no válida: {e}")
        if "valor" not in e:
            raise ValidationError(f"La exclusión no tiene valor: {e}")


def _clave_prioridad(equipo: Equipo):
    revision = equipo.fecha_ultima_revision
    fabricacion = equipo.fecha_fabricacion
    return (
        revision is not None,  # nunca revisados primero
        revision or datetime.min.replace(tzinfo=timezone.get_current_timezone()),
        fabricacion is None,  # sin fecha de fabricación al final
        fabricacion or date.max,
        -equipo.revision_count,
    )


def _motivo(equipo: Equipo, hoy: date) -> str:
    if equipo.fecha_ultima_revision is None:
        partes = ["Sin revisiones registradas"]
    else:
        dias = (hoy - timezone.localtime(equipo.fecha_ultima_revision).date()).days
        partes = [f"Última revisión hace {dias} días"]
    if equipo.fecha_fabricacion:
        partes.append(f"fabricado en {equipo.fecha_fabricacion.year}")
    partes.append(f"{equipo.revision_count} revisiones previas")
    return "; ".join(partes) + "."


def _dias_habiles(desde: date):
    dia = desde
    while True:
        if dia.weekday() < 5:
            yield dia
        dia += timedelta(days=1)


def planificar(
    exclusiones: list[dict],
    dias_ejecucion: int,
    fecha_inicio: date | None = None,
    equipos: QuerySet | None = None,
) -> ResultadoPlan:
    validar_exclusiones(exclusiones)
    hoy = timezone.localdate()
    equipos = list(
        (equipos if equipos is not None else Equipo.objects.all()).select_related(
            "tipo", "marca", "zona", "estado"
        )
    )
    considerados = [
        e
        for e in equipos
        if e.estado.valor == "activo" and not any(_coincide(e, x) for x in exclusiones)
    ]
    considerados.sort(key=_clave_prioridad)

    calendario = []
    if considerados:
        por_dia = math.ceil(len(considerados) / max(1, dias_ejecucion))
        dias = _dias_habiles(fecha_inicio or hoy)
        for i, equipo in enumerate(considerados):
            if i % por_dia == 0:
                dia = next(dias)
            calendario.append(Programacion(equipo, dia, _motivo(equipo, hoy)))

    return ResultadoPlan(
        total_equipos_considerados=len(considerados),
        total_equipos_excluidos=len(equipos) - len(considerados),
        calendario=calendario,
    )
