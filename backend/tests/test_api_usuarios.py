import io

import pytest
from PIL import Image

from apps.accounts.models import User
from apps.accounts.roles import Rol

pytestmark = pytest.mark.django_db
URL = "/api/accounts/usuarios"
JSON = "application/json"


@pytest.mark.parametrize("rol", [Rol.TECNICO_DE_CAMPO, Rol.INGENIERO_DE_OFICINA, Rol.SUPERVISOR])
def test_solo_admin_ve_y_crea_fichas_de_usuario(como, crear_usuario, rol):
    otro = crear_usuario(email="otro@example.com", cedula="0912345678")
    cliente = como(rol)
    assert cliente.get(URL).status_code == 403
    assert cliente.get(f"{URL}/{otro.pk}").status_code == 403
    resp = cliente.post(URL, {"email": "n@example.com", "nombre": "N"}, content_type=JSON)
    assert resp.status_code == 403
    assert como(Rol.ADMINISTRADOR).get(URL).status_code == 200


def test_directorio_sin_datos_personales(como, crear_usuario):
    ana = crear_usuario(email="tec@example.com", cedula="0912345678", rol=Rol.TECNICO_DE_CAMPO)
    User.objects.filter(pk=ana.pk).update(nombre="Ana Técnica")
    resp = como(Rol.TECNICO_DE_CAMPO, email="yo@example.com").get(
        "/api/accounts/directorio", {"rol": Rol.TECNICO_DE_CAMPO, "q": "ana"}
    )
    assert resp.status_code == 200
    [ana] = resp.json()
    assert ana["nombre"] == "Ana Técnica" and ana["perfiles"] == [Rol.TECNICO_DE_CAMPO]
    assert not {"email", "cedula", "numero_rol", "estado_historial"} & set(ana)


def test_admin_crea_usuario_sin_password(como):
    admin = como(Rol.ADMINISTRADOR)
    resp = admin.post(
        URL,
        {
            "email": "Nuevo@Example.com",
            "nombre": "Nuevo",
            "perfiles": ["tecnicoDeCampo"],
            "habilidades": ["Escalador"],
        },
        content_type=JSON,
    )
    assert resp.status_code == 201, resp.content
    datos = resp.json()
    assert datos["email"] == "nuevo@example.com"
    assert datos["perfiles"] == ["tecnicoDeCampo"]
    assert datos["habilidades"] == ["Escalador"]
    assert datos["tiene_password"] is False


def test_admin_crea_usuario_con_password_temporal(como):
    admin = como(Rol.ADMINISTRADOR)
    resp = admin.post(
        URL,
        {"email": "n@example.com", "nombre": "N", "password": "Clave-Temporal-2026"},
        content_type=JSON,
    )
    assert resp.status_code == 201
    assert resp.json()["debe_cambiar_password"] is True
    assert User.objects.get(email="n@example.com").check_password("Clave-Temporal-2026")


def test_email_duplicado_y_password_debil(como):
    admin = como(Rol.ADMINISTRADOR)
    datos = {"email": "administrador@example.com", "nombre": "X"}
    assert admin.post(URL, datos, content_type=JSON).status_code == 409
    datos = {"email": "otro@example.com", "nombre": "X", "password": "123"}
    resp = admin.post(URL, datos, content_type=JSON)
    assert resp.status_code == 400
    assert "contraseña" in resp.json()["detail"].lower()


def test_cambiar_estado_exige_motivo_y_protege_al_propio_admin(como):
    admin = como(Rol.ADMINISTRADOR)
    tecnico = como(Rol.TECNICO_DE_CAMPO).user
    url = f"{URL}/{tecnico.pk}/estado"
    assert (
        admin.post(url, {"estado": "inactivo", "motivo": ""}, content_type=JSON).status_code == 422
    )
    resp = admin.post(url, {"estado": "inactivo", "motivo": "Baja"}, content_type=JSON)
    assert resp.status_code == 200
    assert resp.json()["estado"] == "inactivo"
    assert resp.json()["estado_historial"][0]["motivo"] == "Baja"

    propio = f"{URL}/{admin.user.pk}/estado"
    resp = admin.post(propio, {"estado": "inactivo", "motivo": "x"}, content_type=JSON)
    assert resp.status_code == 403


def test_admin_no_puede_quitarse_su_rol(como):
    admin = como(Rol.ADMINISTRADOR)
    resp = admin.patch(f"{URL}/{admin.user.pk}", {"perfiles": ["supervisor"]}, content_type=JSON)
    assert resp.status_code == 403


def test_admin_edita_roles_de_otro(como):
    admin = como(Rol.ADMINISTRADOR)
    tecnico = como(Rol.TECNICO_DE_CAMPO).user
    resp = admin.patch(
        f"{URL}/{tecnico.pk}",
        {"perfiles": ["supervisor", "tecnicoDeCampo"], "cedula": ""},
        content_type=JSON,
    )
    assert resp.status_code == 200
    assert resp.json()["perfiles"] == ["supervisor", "tecnicoDeCampo"]
    assert resp.json()["cedula"] is None


def test_password_temporal_asignada_por_admin(como):
    admin = como(Rol.ADMINISTRADOR)
    tecnico = como(Rol.TECNICO_DE_CAMPO).user
    resp = admin.post(
        f"{URL}/{tecnico.pk}/password-temporal",
        {"password": "Otra-Temporal-2026"},
        content_type=JSON,
    )
    assert resp.status_code == 200
    tecnico.refresh_from_db()
    assert tecnico.check_password("Otra-Temporal-2026") and tecnico.debe_cambiar_password


def test_editar_mi_nombre_y_foto(como, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    tecnico = como(Rol.TECNICO_DE_CAMPO)
    resp = tecnico.patch("/api/accounts/me", {"nombre": "Nombre Nuevo"}, content_type=JSON)
    assert resp.json()["nombre"] == "Nombre Nuevo"

    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(buffer, "PNG")
    buffer.name = "yo.png"
    buffer.seek(0)
    resp = tecnico.post("/api/accounts/me/foto", {"foto": buffer})
    assert resp.status_code == 200, resp.content
    assert resp.json()["foto_url"].startswith("/media/usuarios/fotos/")


def test_csrf_obligatorio_con_sesion(crear_usuario):
    from django.test import Client

    cliente = Client(enforce_csrf_checks=True)
    cliente.force_login(crear_usuario())
    resp = cliente.patch("/api/accounts/me", {"nombre": "X"}, content_type=JSON)
    assert resp.status_code == 403
