import datetime

import pytest
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.accounts.roles import Rol
from apps.assets.models import Equipo, Vehiculo
from apps.catalogs.models import Configuracion, EstadoVehiculo, TipoVehiculo, Urgencia
from apps.operations.models import OrdenDeTrabajo, OTUnidadAsignada, Trabajo

pytestmark = pytest.mark.django_db
JSON = "application/json"
URL = "/api/planificacion/optimizar"


@pytest.fixture(autouse=True)
def sin_osrm(settings):
    settings.OSRM_URL = ""


@pytest.fixture
def sede(db):
    config = Configuracion.get_solo()
    config.sede_central_ubicacion = Point(-79.9223, -2.1709, srid=4326)
    config.hora_inicio_jornada = datetime.time(8, 0)
    config.hora_fin_jornada = datetime.time(17, 0)
    config.minutos_almuerzo = 60
    config.save()
    return config


def nuevo_vehiculo(codigo, tipo):
    return Vehiculo.objects.create(
        codigo=codigo,
        placa=f"P-{codigo}",
        tipo=TipoVehiculo.objects.get(valor=tipo),
        estado=EstadoVehiculo.objects.get(valor="disponible"),
    )


@pytest.fixture
def flota(db):
    return {
        "canasta": nuevo_vehiculo("C1", "camionCanasta"),
        "p1": nuevo_vehiculo("P1", "camionetaCabinaDoble"),
        "p2": nuevo_vehiculo("P2", "camionetaCabinaSimple"),
    }


@pytest.fixture
def solicitudes(crear_solicitud, equipo):
    """Tres pendientes para hoy: una urgente, una que requiere canasta y una normal."""
    con_canasta = Equipo.objects.create(
        codigo="CAN-1",
        tipo=equipo.tipo,
        marca=equipo.marca,
        zona=equipo.zona,
        estado=equipo.estado,
        direccion="Poste alto",
        ubicacion=Point(-79.90, -2.15, srid=4326),
        tipo_comunicacion="Celular",
        requiere_canasta=True,
    )
    hoy = timezone.localdate()
    return [
        crear_solicitud(fecha_programada=hoy, urgencia=Urgencia.objects.get(valor="urgente")),
        crear_solicitud(fecha_programada=hoy, equipo=con_canasta),
        crear_solicitud(fecha_programada=hoy),
        crear_solicitud(fecha_programada=hoy + datetime.timedelta(days=5)),  # fuera de fecha
    ]


def test_propone_rutas_respetando_reglas(como, sede, flota, solicitudes):
    urgente, canasta, normal, futura = solicitudes
    resp = como(Rol.SUPERVISOR).post(
        URL,
        {
            "rutas": [
                {"id": "R1", "vehiculos": ["C1", "P1"]},
                {"id": "R2", "vehiculos": ["P2"]},
            ],
            "tiempo_limite_s": 2,
        },
        content_type=JSON,
    )
    assert resp.status_code == 200, resp.content
    plan = resp.json()
    assert plan["fuente_tiempos"] == "estimado"
    assert plan["jornada_min"] == 480  # 9 h − 1 h de almuerzo
    assert plan["hora_inicio"] == "08:00"
    visitas = {r["id"]: [v["solicitud_id"] for v in r["visitas"]] for r in plan["rutas"]}
    todas = [s for vs in visitas.values() for s in vs]
    assert sorted(todas) == sorted([urgente.pk, canasta.pk, normal.pk])  # la futura no entra
    assert canasta.pk in visitas["R1"]  # la única ruta con camión canasta
    ruta_urgente = next(vs for vs in visitas.values() if urgente.pk in vs)
    assert ruta_urgente[0] == urgente.pk
    r1 = next(r for r in plan["rutas"] if r["id"] == "R1")
    assert r1["geometria"][0] == r1["geometria"][-1]  # sale y vuelve a la sede
    assert not plan["no_asignadas"]


def test_canasta_no_sale_sola(como, sede, flota, solicitudes):
    resp = como(Rol.SUPERVISOR).post(
        URL, {"rutas": [{"id": "R1", "vehiculos": ["C1"]}]}, content_type=JSON
    )
    assert resp.status_code == 400
    assert "no puede salir solo" in resp.json()["detail"]


def test_sin_camion_canasta_explica_el_motivo(como, sede, flota, solicitudes):
    resp = como(Rol.SUPERVISOR).post(
        URL, {"rutas": [{"id": "R1", "vehiculos": ["P1"]}], "tiempo_limite_s": 1}, content_type=JSON
    )
    no_asignadas = resp.json()["no_asignadas"]
    assert [n["solicitud_id"] for n in no_asignadas] == [solicitudes[1].pk]
    assert "canasta" in no_asignadas[0]["motivo"]


def test_validaciones(como, flota, solicitudes):
    supervisor = como(Rol.SUPERVISOR)
    cuerpo = {"rutas": [{"id": "R1", "vehiculos": ["P1"]}]}
    assert "sede central" in supervisor.post(URL, cuerpo, content_type=JSON).json()["detail"]
    assert como(Rol.INGENIERO_DE_OFICINA).post(URL, cuerpo, content_type=JSON).status_code == 403
    repetido = {"rutas": [{"id": "A", "vehiculos": ["P1"]}, {"id": "B", "vehiculos": ["P1"]}]}
    Configuracion.objects.update(sede_central_ubicacion=Point(-79.9, -2.17, srid=4326))
    assert "dos rutas" in supervisor.post(URL, repetido, content_type=JSON).json()["detail"]


def test_rutas_del_dia(como, sede, flota, solicitudes, supervisor):
    orden = OrdenDeTrabajo.objects.create(creado_por=supervisor)
    OTUnidadAsignada.objects.create(orden=orden, vehiculo=flota["p1"])
    for s in solicitudes[:2]:
        Trabajo.objects.create(
            orden=orden, equipo=s.equipo, solicitud=s, tipo_trabajo=s.tipo_trabajo
        )
    datos = como(Rol.TECNICO_DE_CAMPO).get("/api/planificacion/rutas-del-dia").json()
    assert datos["sede"] == {"lat": -2.1709, "lng": -79.9223}
    ruta = datos["rutas"][0]
    assert ruta["placas"] == ["P-P1"]
    assert [t["secuencia"] for t in ruta["trabajos"]] == [1, 2]
    assert len(ruta["geometria"]) == 4  # sede → 2 trabajos → sede (sin OSRM: tramos rectos)


def test_trazado_en_linea_recta_no_se_guarda_en_cache(settings):
    from django.core.cache import cache

    from apps.routing import api as rutas

    settings.OSRM_URL = ""  # sin OSRM: línea recta
    puntos = [(-2.17, -79.92), (-2.18, -79.93)]
    assert rutas._geometria(puntos) == [[-79.92, -2.17], [-79.93, -2.18]]
    assert (
        cache.get("ruta:" + rutas.hashlib.sha1(rutas.json.dumps(puntos).encode()).hexdigest())
        is None
    )
