import json

import pytest

from apps.accounts.roles import Rol

pytestmark = pytest.mark.django_db

LOGIN_URL = "/api/auth/browser/v1/auth/login"
SESSION_URL = "/api/auth/browser/v1/auth/session"


def login(client, email, password):
    return client.post(
        LOGIN_URL,
        data=json.dumps({"email": email, "password": password}),
        content_type="application/json",
    )


def test_health_es_publico(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_csrf_fija_cookie(client):
    resp = client.get("/api/csrf")
    assert resp.status_code == 200
    assert "csrftoken" in resp.cookies


def test_me_requiere_autenticacion(client):
    assert client.get("/api/accounts/me").status_code == 401


def test_login_y_me(client, crear_usuario):
    crear_usuario(email="tec@example.com", password="clave-segura-123", rol=Rol.TECNICO_DE_CAMPO)
    resp = login(client, "TEC@example.com", "clave-segura-123")
    assert resp.status_code == 200, resp.content
    assert resp.json()["data"]["user"]["email"] == "tec@example.com"

    me = client.get("/api/accounts/me").json()
    assert me["email"] == "tec@example.com"
    assert me["perfiles"] == ["tecnicoDeCampo"]
    assert me["estado"] == "activo"

    assert client.delete(SESSION_URL).status_code == 401  # sesión cerrada
    assert client.get("/api/accounts/me").status_code == 401


def test_login_con_clave_incorrecta(client, crear_usuario):
    crear_usuario(email="tec@example.com", password="clave-segura-123")
    assert login(client, "tec@example.com", "otra").status_code == 400


def test_usuario_inactivo_no_puede_entrar(client, crear_usuario):
    user = crear_usuario(email="tec@example.com", password="clave-segura-123")
    user.cambiar_estado("inactivo", "Baja", user)
    resp = login(client, "tec@example.com", "clave-segura-123")
    assert resp.status_code != 200
    assert client.get("/api/accounts/me").status_code == 401


def test_registro_publico_deshabilitado(client, roles):
    resp = client.post(
        "/api/auth/browser/v1/auth/signup",
        data=json.dumps({"email": "nuevo@example.com", "password": "clave-segura-123"}),
        content_type="application/json",
    )
    assert resp.status_code == 403


def test_media_auth_requiere_sesion(client, crear_usuario):
    assert client.get("/api/media-auth").status_code == 401
    crear_usuario(email="tec@example.com", password="clave-segura-123")
    login(client, "tec@example.com", "clave-segura-123")
    assert client.get("/api/media-auth").status_code == 200


def test_docs_solo_para_staff(client, crear_usuario):
    assert client.get("/api/docs").status_code == 302  # redirige al login del admin
    crear_usuario(email="admin@example.com", password="clave-segura-123", is_staff=True)
    client.login(email="admin@example.com", password="clave-segura-123")
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").status_code == 200


def test_login_con_csrf_desde_el_origen_del_frontend(crear_usuario, settings):
    """En desarrollo el navegador envía Origin del frontend (Next reenvía /api)."""
    from django.test import Client

    crear_usuario(email="tec@example.com", password="clave-segura-123")
    cliente = Client(enforce_csrf_checks=True)
    token = cliente.get("/api/csrf").json()["csrfToken"]
    resp = cliente.post(
        LOGIN_URL,
        data=json.dumps({"email": "tec@example.com", "password": "clave-segura-123"}),
        content_type="application/json",
        headers={"X-CSRFToken": token, "Origin": settings.FRONTEND_URL},
    )
    assert resp.status_code == 200, resp.content[:200]
    otro = cliente.post(
        LOGIN_URL,
        data="{}",
        content_type="application/json",
        headers={"X-CSRFToken": token, "Origin": "https://sitio-malicioso.example"},
    )
    assert otro.status_code == 403
