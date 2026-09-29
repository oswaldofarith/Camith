import datetime

import pytest

from apps.core.models import siguiente_display_id
from apps.operations.models import OrdenDeTrabajo, Trabajo

pytestmark = pytest.mark.django_db

E = OrdenDeTrabajo.Estado
T = Trabajo.Estado


def test_display_id_secuencial_por_dia_y_prefijo():
    dia = datetime.date(2026, 9, 29)
    assert siguiente_display_id("SOL", dia) == "SOL-20260929-001"
    assert siguiente_display_id("SOL", dia) == "SOL-20260929-002"
    assert siguiente_display_id("OT", dia) == "OT-20260929-001"
    assert siguiente_display_id("SOL", dia + datetime.timedelta(days=1)) == "SOL-20260930-001"


def test_solicitud_recibe_display_id(crear_solicitud):
    s1, s2 = crear_solicitud(), crear_solicitud()
    assert s1.display_id.startswith("SOL-")
    assert s1.display_id != s2.display_id
    assert s1.estado == "pendiente"


def test_trabajos_se_numeran_dentro_de_la_ot(crear_solicitud, supervisor):
    orden = OrdenDeTrabajo.objects.create(creado_por=supervisor)
    trabajos = [
        Trabajo.objects.create(
            orden=orden, equipo=s.equipo, solicitud=s, tipo_trabajo=s.tipo_trabajo
        )
        for s in (crear_solicitud(), crear_solicitud())
    ]
    assert [t.codigo for t in trabajos] == [f"{orden.display_id}-T1", f"{orden.display_id}-T2"]


@pytest.mark.parametrize(
    ("estados", "esperado"),
    [
        ([], E.PENDIENTE),
        ([T.PENDIENTE, T.PENDIENTE], E.PENDIENTE),
        ([T.PENDIENTE, T.COMPLETADO], E.EN_PROGRESO),
        ([T.PENDIENTE, T.CANCELADO], E.EN_PROGRESO),
        ([T.CANCELADO, T.CANCELADO], E.CANCELADA),
        ([T.COMPLETADO, T.COMPLETADO], E.COMPLETADA_TOTAL),
        ([T.COMPLETADO, T.NO_COMPLETADO], E.COMPLETADA_PARCIAL),
        ([T.COMPLETADO, T.CANCELADO], E.COMPLETADA_PARCIAL),
    ],
)
def test_calcular_estado(estados, esperado):
    assert OrdenDeTrabajo.calcular_estado(estados) == esperado


def test_recalcular_estado(crear_solicitud, supervisor):
    orden = OrdenDeTrabajo.objects.create(creado_por=supervisor)
    s = crear_solicitud()
    trabajo = Trabajo.objects.create(
        orden=orden, equipo=s.equipo, solicitud=s, tipo_trabajo=s.tipo_trabajo
    )
    assert orden.recalcular_estado() == E.PENDIENTE
    trabajo.estado = T.COMPLETADO
    trabajo.save()
    orden.recalcular_estado()
    orden.refresh_from_db()
    assert orden.estado_general == E.COMPLETADA_TOTAL
