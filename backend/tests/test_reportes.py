import datetime

import pytest
from django.utils import timezone

from apps.accounts.roles import Rol
from apps.catalogs.models import TipoTrabajo
from apps.operations.models import OrdenDeTrabajo, OTUnidadAsignada, Solicitud, Trabajo

pytestmark = pytest.mark.django_db

HOY = timezone.localdate()
RANGO = f"desde={HOY - datetime.timedelta(days=60)}&hasta={HOY}"


@pytest.fixture
def datos(crear_solicitud, supervisor, vehiculo, crear_usuario, tipo_trabajo):
    """3 solicitudes → 1 OT con 3 trabajos: completado, no completado y cancelado."""
    tecnico = crear_usuario(email="t1@example.com", rol=Rol.TECNICO_DE_CAMPO)
    otro_tipo = TipoTrabajo.objects.create(
        tipo_equipo=tipo_trabajo.tipo_equipo, nombre="Instalación"
    )
    orden = OrdenDeTrabajo.objects.create(creado_por=supervisor)
    unidad = OTUnidadAsignada.objects.create(orden=orden, vehiculo=vehiculo)
    unidad.tecnicos.add(tecnico)
    ahora = timezone.now()
    for estado, tipo in [
        (Trabajo.Estado.COMPLETADO, tipo_trabajo),
        (Trabajo.Estado.NO_COMPLETADO, otro_tipo),
        (Trabajo.Estado.CANCELADO, tipo_trabajo),
    ]:
        s = crear_solicitud()
        Trabajo.objects.create(
            orden=orden,
            equipo=s.equipo,
            solicitud=s,
            tipo_trabajo=tipo,
            estado=estado,
            fecha_finalizacion=ahora,
        )
    return tecnico


def test_solo_supervisor_y_admin(como, datos):
    assert como(Rol.INGENIERO_DE_OFICINA).get(f"/api/reportes/tecnicos?{RANGO}").status_code == 403
    assert como(Rol.SUPERVISOR).get(f"/api/reportes/tecnicos?{RANGO}").status_code == 200


def test_solicitudes_mensual(como, datos):
    filas = como(Rol.SUPERVISOR).get(f"/api/reportes/solicitudes-mensual?{RANGO}").json()
    mes = HOY.strftime("%Y-%m")
    assert filas == [
        {"mes": mes, "solicitudes_creadas": 3, "trabajos_completados": 1, "porcentaje_exito": 33.3}
    ]


def test_productividad_por_tipos_reales(como, datos):
    r = como(Rol.SUPERVISOR).get(f"/api/reportes/productividad-mensual?{RANGO}").json()
    # Solo cuentan los completados; el tipo es el del catálogo, no una lista fija.
    assert r["tipos"] == ["Revisión"]
    assert r["filas"][0]["por_tipo"] == {"Revisión": 1}


def test_ranking_equipos_sin_cancelados(como, datos, equipo):
    r = como(Rol.SUPERVISOR).get(f"/api/reportes/ranking-equipos?{RANGO}").json()
    fila = r["filas"][0]
    assert (fila["equipo"], fila["total"], fila["no_completados"]) == (equipo.codigo, 2, 1)
    assert fila["por_tipo"] == {"Revisión": 1, "Instalación": 1}
    vacio = (
        como(Rol.SUPERVISOR)
        .get(f"/api/reportes/ranking-equipos?{RANGO}&tipo_equipo=medidor")
        .json()
    )
    assert vacio["filas"] == []


def test_estadisticas_tecnicos(como, datos):
    r = como(Rol.SUPERVISOR).get(f"/api/reportes/tecnicos?{RANGO}").json()
    fila = r["filas"][0]
    assert fila["tecnico_id"] == datos.pk
    assert (fila["atendidos"], fila["completados"], fila["no_completados"]) == (2, 1, 1)
    assert fila["efectividad"] == 50.0


def test_fuera_de_rango(como, datos):
    antes = HOY - datetime.timedelta(days=400)
    r = (
        como(Rol.SUPERVISOR)
        .get(f"/api/reportes/tecnicos?desde={antes}&hasta={antes + datetime.timedelta(days=10)}")
        .json()
    )
    assert r["filas"] == []
    assert Solicitud.objects.count() == 3
