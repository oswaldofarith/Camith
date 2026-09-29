import pytest

from apps.accounts.roles import Rol

pytestmark = pytest.mark.django_db
JSON = "application/json"


def test_catalogos_completos(como, tipo_trabajo):
    datos = como(Rol.TECNICO_DE_CAMPO).get("/api/catalogos").json()
    assert [m["valor"] for m in datos["marcas"]] == ["honeywell", "itron", "trilliant"]
    colector = next(t for t in datos["tipos_equipo"] if t["valor"] == "colector")
    assert colector["tipos_trabajo"][0]["nombre"] == "Revisión"
    assert datos["configuracion"]["zona_horaria"] == "America/Guayaquil"


def test_solo_admin_edita_catalogos(como):
    item = {"valor": "landis", "etiqueta": "Landis+Gyr"}
    assert (
        como(Rol.SUPERVISOR).post("/api/catalogos/marcas", item, content_type=JSON).status_code
        == 403
    )
    admin = como(Rol.ADMINISTRADOR)
    assert admin.post("/api/catalogos/marcas", item, content_type=JSON).status_code == 201
    resp = admin.patch("/api/catalogos/marcas/landis", {"activo": False}, content_type=JSON)
    assert resp.json()["activo"] is False
    assert admin.delete("/api/catalogos/marcas/landis").status_code == 204


def test_catalogo_inexistente_y_valor_en_uso(como, equipo):
    admin = como(Rol.ADMINISTRADOR)
    assert (
        admin.post(
            "/api/catalogos/colores", {"valor": "x", "etiqueta": "X"}, content_type=JSON
        ).status_code
        == 422
    )
    # "honeywell" está en uso por el equipo de prueba: se protege.
    assert admin.delete("/api/catalogos/marcas/honeywell").status_code == 409


def test_configuracion_y_tipos_trabajo(como):
    admin = como(Rol.ADMINISTRADOR)
    resp = admin.put(
        "/api/catalogos/configuracion",
        {
            "empresa_nombre": "CNEL",
            "sede_central": {"lat": -2.17, "lng": -79.92},
            "hora_inicio_jornada": "08:00",
            "minutos_almuerzo": 45,
        },
        content_type=JSON,
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["sede_central"] == {"lat": -2.17, "lng": -79.92}

    resp = admin.post(
        "/api/catalogos/tipos-trabajo",
        {"tipo_equipo": "medidor", "nombre": "Cambio de medidor", "tiempo_estimado_minutos": 20},
        content_type=JSON,
    )
    assert resp.status_code == 201
    assert resp.json()["tipo_equipo"] == "medidor"

    resp = admin.post(
        "/api/catalogos/localidades",
        {"nombre": "Daule", "lat": -1.86, "lng": -79.98},
        content_type=JSON,
    )
    assert resp.status_code == 201 and resp.json()["lat"] == -1.86
