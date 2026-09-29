import json
import re

import pytest
from django.core import mail
from django.core.management import CommandError, call_command

from apps.accounts.models import User

pytestmark = pytest.mark.django_db

TEMPORAL = "Temporal-de-prueba-2026"
BASE = "/api/auth/browser/v1"


@pytest.fixture
def exportacion(tmp_path):
    perfiles = [
        {
            "id": "uid-admin",
            "nombre": "Admin Principal",
            "email": "Admin@Example.com",
            "cedula": "0900000001",
            "estado": "activo",
            "perfiles": ["administrador"],
        },
        {
            "id": "uid-tec",
            "nombre": "Técnico Uno",
            "email": "tec@example.com",
            "cedula": "0900000002",
            "estado": "activo",
            "perfiles": ["tecnicoDeCampo"],
            "habilidades": ["Escalador", "Habilidad Nueva"],
            "numeroRol": "R-15",
        },
        {
            "id": "uid-baja",
            "nombre": "Ex Empleado",
            "email": "baja@example.com",
            "estado": "inactivo",
            "perfiles": ["supervisor"],
            "estadoHistorial": [
                {
                    "estado": "inactivo",
                    "fecha": "2025-03-01T15:00:00.000Z",
                    "modificadoPor": "uid-admin",
                    "motivo": "Renuncia",
                }
            ],
        },
    ]
    cuentas = [
        {"uid": "uid-admin", "email": "admin@example.com", "disabled": False},
        {"uid": "uid-tec", "email": "tec@example.com", "disabled": False},
        {"uid": "uid-baja", "email": "baja@example.com", "disabled": True},
        {"uid": "uid-huerfano", "email": "x@example.com", "disabled": False},
    ]
    (tmp_path / "users.json").write_text(json.dumps(perfiles))
    (tmp_path / "auth_users.json").write_text(json.dumps(cuentas))
    return tmp_path


def importar(carpeta, monkeypatch, password=TEMPORAL):
    monkeypatch.setenv("ADMIN_TEMP_PASSWORD", password)
    call_command("importar_usuarios", dir=str(carpeta), admin_email="admin@example.com")


def login(client, email, password):
    return client.post(
        f"{BASE}/auth/login",
        data=json.dumps({"email": email, "password": password}),
        content_type="application/json",
    )


def test_importa_perfiles_roles_y_estado(exportacion, monkeypatch):
    importar(exportacion, monkeypatch)

    assert User.objects.count() == 3  # la cuenta sin perfil no se importa
    tec = User.objects.get(email="tec@example.com")
    assert tec.firebase_uid == "uid-tec"
    assert tec.perfiles == ["tecnicoDeCampo"]
    assert sorted(h.nombre for h in tec.habilidades.all()) == ["Escalador", "Habilidad Nueva"]
    assert tec.numero_rol == "R-15"

    baja = User.objects.get(email="baja@example.com")
    assert not baja.is_active
    historial = baja.estado_historial.get()
    assert (historial.motivo, historial.modificado_por.email) == ("Renuncia", "admin@example.com")


def test_solo_el_admin_tiene_password_y_no_se_envian_correos(exportacion, monkeypatch):
    importar(exportacion, monkeypatch)

    admin = User.objects.get(email="admin@example.com")
    assert admin.check_password(TEMPORAL)
    assert admin.debe_cambiar_password and admin.is_staff and admin.is_superuser
    for email in ("tec@example.com", "baja@example.com"):
        assert not User.objects.get(email=email).has_usable_password()
    assert mail.outbox == []


def test_reimportar_no_pisa_passwords_elegidas(exportacion, monkeypatch):
    importar(exportacion, monkeypatch)
    tec = User.objects.get(email="tec@example.com")
    tec.set_password("la-mia-propia-123")
    tec.save()
    admin = User.objects.get(email="admin@example.com")
    admin.set_password("admin-definitiva-123")
    admin.debe_cambiar_password = False
    admin.save()

    importar(exportacion, monkeypatch, password="otra-temporal-distinta")

    assert User.objects.get(email="tec@example.com").check_password("la-mia-propia-123")
    admin.refresh_from_db()
    assert admin.check_password("admin-definitiva-123")
    assert User.objects.get(email="baja@example.com").estado_historial.count() == 1


def test_password_temporal_corta_se_rechaza(exportacion, monkeypatch):
    with pytest.raises(CommandError):
        importar(exportacion, monkeypatch, password="corta")


def test_usuario_importado_recupera_su_password(client, exportacion, monkeypatch):
    importar(exportacion, monkeypatch)

    resp = client.post(
        f"{BASE}/auth/password/request",
        data=json.dumps({"email": "tec@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 200, resp.content
    assert len(mail.outbox) == 1
    key = re.search(r"/reset-password/(\S+)", mail.outbox[0].body).group(1)

    resp = client.post(
        f"{BASE}/auth/password/reset",
        data=json.dumps({"key": key, "password": "nueva-clave-segura-1"}),
        content_type="application/json",
    )
    assert resp.status_code in (200, 401), resp.content
    assert login(client, "tec@example.com", "nueva-clave-segura-1").status_code == 200


def test_admin_debe_cambiar_la_temporal(client, exportacion, monkeypatch):
    importar(exportacion, monkeypatch)
    assert login(client, "admin@example.com", TEMPORAL).status_code == 200
    assert client.get("/api/accounts/me").json()["debe_cambiar_password"] is True

    resp = client.post(
        f"{BASE}/account/password/change",
        data=json.dumps({"current_password": TEMPORAL, "new_password": "admin-definitiva-123"}),
        content_type="application/json",
    )
    assert resp.status_code in (200, 401), resp.content
    admin = User.objects.get(email="admin@example.com")
    assert admin.check_password("admin-definitiva-123")
    assert not admin.debe_cambiar_password
