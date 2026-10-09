import datetime

import pytest
from django.contrib.gis.geos import Point
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.roles import Rol
from apps.assets.models import Equipo
from apps.catalogs.models import EstadoEquipo, Marca, TipoEquipo, Zona
from apps.operations.models import PlanMantenimiento
from apps.operations.planificador import planificar

pytestmark = pytest.mark.django_db
JSON = "application/json"
LUNES = datetime.date(2026, 10, 5)


def nuevo(codigo, revision=None, fabricacion=None, revisiones=0, **extra):
    datos = {
        "tipo": TipoEquipo.objects.get(valor="colector"),
        "marca": Marca.objects.get(valor="honeywell"),
        "zona": Zona.objects.get(valor="norte"),
        "estado": EstadoEquipo.objects.get(valor="activo"),
        **extra,
    }
    return Equipo.objects.create(
        codigo=codigo,
        direccion="x",
        ubicacion=Point(-79.9, -2.1, srid=4326),
        tipo_comunicacion="Celular",
        fecha_ultima_revision=(
            timezone.make_aware(datetime.datetime(*revision)) if revision else None
        ),
        fecha_fabricacion=datetime.date(*fabricacion) if fabricacion else None,
        revision_count=revisiones,
        **datos,
    )


def codigos(resultado):
    return [p.equipo.codigo for p in resultado.calendario]


def test_prioridad():
    nuevo("RECIENTE", revision=(2026, 9, 1))
    nuevo("ANTIGUA", revision=(2024, 1, 1))
    nuevo("NUNCA_VIEJO", fabricacion=(2015, 1, 1))
    nuevo("NUNCA_NUEVO", fabricacion=(2022, 1, 1))
    nuevo("NUNCA_SIN_FAB_MUCHAS", revisiones=9)
    nuevo("NUNCA_SIN_FAB_POCAS", revisiones=1)
    resultado = planificar([], 30, LUNES)
    assert codigos(resultado) == [
        "NUNCA_VIEJO",
        "NUNCA_NUEVO",
        "NUNCA_SIN_FAB_MUCHAS",
        "NUNCA_SIN_FAB_POCAS",
        "ANTIGUA",
        "RECIENTE",
    ]
    assert resultado.calendario[0].motivo_prioridad.startswith("Sin revisiones registradas")
    assert "Última revisión hace" in resultado.calendario[-1].motivo_prioridad


def test_exclusiones_y_estado():
    nuevo("ACTIVO")
    nuevo("BAJA", estado=EstadoEquipo.objects.get(valor="dado-de-baja"))
    nuevo("SUR", zona=Zona.objects.get(valor="sur"))
    nuevo("PELIGRO", zona_peligrosa=True)

    r = planificar([{"campo": "zona", "operador": "es", "valor": "Sur"}], 10, LUNES)
    assert sorted(codigos(r)) == ["ACTIVO", "PELIGRO"]
    assert (r.total_equipos_considerados, r.total_equipos_excluidos) == (2, 2)

    # "no_es": se excluye todo lo que NO sea de la zona sur.
    r = planificar([{"campo": "zona", "operador": "no_es", "valor": "sur"}], 10, LUNES)
    assert codigos(r) == ["SUR"]

    r = planificar([{"campo": "zonaPeligrosa", "operador": "es", "valor": True}], 10, LUNES)
    assert sorted(codigos(r)) == ["ACTIVO", "SUR"]


def test_exclusion_invalida():
    with pytest.raises(ValidationError):
        planificar([{"campo": "ip", "operador": "es", "valor": "x"}], 10, LUNES)


def test_reparto_en_dias_habiles():
    for i in range(7):
        nuevo(f"E{i}")
    viernes = datetime.date(2026, 10, 9)
    # 7 equipos en 3 días hábiles → 3 por día; empieza el viernes y salta el fin de semana.
    fechas = [p.fecha_programada for p in planificar([], 3, viernes).calendario]
    assert fechas == [viernes] * 3 + [datetime.date(2026, 10, 12)] * 3 + [
        datetime.date(2026, 10, 13)
    ]
    # Si empieza en sábado, arranca el lunes.
    sabado = datetime.date(2026, 10, 10)
    assert planificar([], 7, sabado).calendario[0].fecha_programada == datetime.date(2026, 10, 12)


def test_api_previsualizar_y_generar(como):
    nuevo("A")
    nuevo("B", zona=Zona.objects.get(valor="sur"))
    supervisor = como(Rol.SUPERVISOR)
    datos = {
        "nombre": "Plan Q4",
        "tiempo_de_ejecucion_dias": 20,
        "exclusiones": [{"campo": "zona", "operador": "es", "valor": "sur"}],
        "fecha_inicio": "2026-10-05",
    }
    previa = supervisor.post(
        "/api/planes-mantenimiento/previsualizar", datos, content_type=JSON
    ).json()
    assert previa["total_equipos_excluidos"] == 1
    assert previa["calendario"][0]["equipo"] == "A"
    assert PlanMantenimiento.objects.count() == 0

    resp = supervisor.post("/api/planes-mantenimiento/generar", datos, content_type=JSON)
    assert resp.status_code == 201, resp.content
    plan = resp.json()
    assert plan["estado"] == "activo"
    assert plan["estadisticas"]["totalMantenimientosProgramados"] == 1
    assert plan["calendario"][0]["fecha_programada"] == "2026-10-05"

    tecnico = como(Rol.TECNICO_DE_CAMPO)
    assert (
        tecnico.post("/api/planes-mantenimiento/generar", datos, content_type=JSON).status_code
        == 403
    )
