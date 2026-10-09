import pytest

from apps.accounts.roles import Rol
from apps.assets.models import Equipo

pytestmark = pytest.mark.django_db
JSON = "application/json"


def datos_equipo(codigo="REP-001", lat=-2.17, lng=-79.92, **extra):
    return {
        "codigo": codigo,
        "tipo": "repetidor",
        "marca": "itron",
        "zona": "sur",
        "estado": "activo",
        "direccion": "Calle 1",
        "lat": lat,
        "lng": lng,
        "tipo_comunicacion": "Celular",
        **extra,
    }


def test_crear_y_editar_equipo_con_historial(como):
    supervisor = como(Rol.SUPERVISOR)
    resp = supervisor.post("/api/equipos", datos_equipo(), content_type=JSON)
    assert resp.status_code == 201, resp.content
    assert resp.json()["lat"] == -2.17
    assert len(resp.json()["estado_historial"]) == 1

    resp = supervisor.patch(
        "/api/equipos/REP-001",
        {"estado": "dado-de-baja", "motivo_estado": "Retirado", "lat": -2.2},
        content_type=JSON,
    )
    assert resp.status_code == 200
    datos = resp.json()
    assert (datos["estado"], datos["lat"], datos["lng"]) == ("dado-de-baja", -2.2, -79.92)
    assert datos["estado_historial"][0]["motivo"] == "Retirado"


def test_validaciones_equipo(como):
    supervisor = como(Rol.SUPERVISOR)
    resp = supervisor.post("/api/equipos", datos_equipo(marca="acme"), content_type=JSON)
    assert resp.status_code == 400 and "acme" in resp.json()["detail"]
    assert (
        supervisor.post("/api/equipos", datos_equipo(lat=120), content_type=JSON).status_code == 422
    )
    tecnico = como(Rol.TECNICO_DE_CAMPO)
    assert tecnico.post("/api/equipos", datos_equipo(), content_type=JSON).status_code == 403


def test_busqueda_por_cercania_y_bbox(como):
    supervisor = como(Rol.SUPERVISOR)
    supervisor.post("/api/equipos", datos_equipo("CERCA", -2.1700, -79.9200), content_type=JSON)
    supervisor.post("/api/equipos", datos_equipo("MEDIO", -2.1720, -79.9200), content_type=JSON)
    supervisor.post("/api/equipos", datos_equipo("LEJOS", -2.3000, -79.9200), content_type=JSON)

    resp = supervisor.get("/api/equipos?cerca_lat=-2.17&cerca_lng=-79.92&radio_m=500").json()
    assert [e["codigo"] for e in resp["items"]] == ["CERCA", "MEDIO"]
    assert 200 < resp["items"][1]["distancia_m"] < 250

    resp = supervisor.get("/api/equipos?bbox=-79.95,-2.2,-79.9,-2.1").json()
    assert {e["codigo"] for e in resp["items"]} == {"CERCA", "MEDIO"}

    mapa = supervisor.get("/api/equipos/mapa").json()
    assert len(mapa["features"]) == 3
    assert mapa["features"][0]["geometry"]["type"] == "Point"


def test_importacion_por_lote(como):
    supervisor = como(Rol.SUPERVISOR)
    supervisor.post("/api/equipos", datos_equipo("EXISTE"), content_type=JSON)
    lote = [
        datos_equipo("NUEVO", revision_count=4),
        datos_equipo("EXISTE", direccion="Nueva dirección"),
        datos_equipo("MALO", zona="marte"),
    ]
    resp = supervisor.post("/api/equipos/lote", lote, content_type=JSON).json()
    assert (resp["creados"], resp["actualizados"]) == (1, 1)
    assert resp["errores"][0]["codigo"] == "MALO"
    assert Equipo.objects.get(codigo="NUEVO").revision_count == 4
    assert Equipo.objects.get(codigo="EXISTE").direccion == "Nueva dirección"


def test_lote_conserva_lo_que_no_viene_en_el_archivo(como):
    """Reimportar una hoja sin algunas columnas no debe borrar esos datos."""
    supervisor = como(Rol.SUPERVISOR)
    supervisor.post(
        "/api/equipos",
        datos_equipo(
            "EXISTE",
            tipo_comunicacion="Fibra óptica",
            piloto="P-7",
            requiere_canasta=True,
            fecha_fabricacion="2020-05-01",
            campos_adicionales={"ubicacion_pendiente": True},
        ),
        content_type=JSON,
    )
    Equipo.objects.filter(codigo="EXISTE").update(revision_count=5)
    # Solo las columnas obligatorias, más un contador viejo que no debe aplicarse.
    fila = datos_equipo("EXISTE", direccion="Nueva dirección", revision_count=0)
    del fila["tipo_comunicacion"]
    resp = supervisor.post("/api/equipos/lote", [fila], content_type=JSON)
    assert resp.json()["actualizados"] == 1, resp.content

    e = Equipo.objects.get(codigo="EXISTE")
    assert e.direccion == "Nueva dirección"
    assert (e.tipo_comunicacion, e.piloto, e.requiere_canasta) == ("Fibra óptica", "P-7", True)
    assert str(e.fecha_fabricacion) == "2020-05-01"
    assert e.campos_adicionales == {"ubicacion_pendiente": True}
    assert e.revision_count == 5  # lo mantienen los trabajos, no la hoja

    # Un alta sin tipo de comunicación toma el valor por defecto.
    fila = datos_equipo("NUEVO-2")
    del fila["tipo_comunicacion"]
    supervisor.post("/api/equipos/lote", [fila], content_type=JSON)
    assert Equipo.objects.get(codigo="NUEVO-2").tipo_comunicacion == "Celular"


def test_equipo_con_solicitudes_no_se_borra(como, crear_solicitud):
    solicitud = crear_solicitud()
    resp = como(Rol.SUPERVISOR).delete(f"/api/equipos/{solicitud.equipo.codigo}")
    assert resp.status_code == 409


def test_vehiculos_crud(como):
    supervisor = como(Rol.SUPERVISOR)
    datos = {"codigo": "V-9", "placa": "GBB-999", "tipo": "camionCanasta", "estado": "disponible"}
    assert supervisor.post("/api/vehiculos", datos, content_type=JSON).status_code == 201
    assert supervisor.post("/api/vehiculos", datos, content_type=JSON).status_code == 400
    resp = supervisor.patch("/api/vehiculos/V-9", {"estado": "enMantenimiento"}, content_type=JSON)
    assert resp.json()["estado"] == "enMantenimiento"
    assert supervisor.get("/api/vehiculos?estado=enMantenimiento").json()[0]["codigo"] == "V-9"
    assert supervisor.delete("/api/vehiculos/V-9").status_code == 204
