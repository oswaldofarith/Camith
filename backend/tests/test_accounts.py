import pytest
from django.contrib.auth.models import Group, Permission

from apps.accounts.models import User, UserEstadoHistorial
from apps.accounts.roles import APPS_DEL_DOMINIO, Rol

pytestmark = pytest.mark.django_db


def test_create_user_normaliza_email_y_no_es_staff():
    user = User.objects.create_user(email="Ana@Example.COM", password="x", nombre="Ana")
    assert user.email == "ana@example.com"
    assert user.check_password("x")
    assert not user.is_staff and not user.is_superuser
    assert user.estado == "activo"


def test_create_superuser():
    user = User.objects.create_superuser(email="root@example.com", password="x", nombre="Root")
    assert user.is_staff and user.is_superuser
    assert user.has_role(Rol.ADMINISTRADOR)


def test_perfiles_y_has_role(crear_usuario):
    user = crear_usuario(rol=Rol.TECNICO_DE_CAMPO)
    user.groups.add(Group.objects.get(name=Rol.SUPERVISOR))
    assert user.perfiles == ["supervisor", "tecnicoDeCampo"]
    assert user.has_role(Rol.SUPERVISOR, Rol.ADMINISTRADOR)
    assert not user.has_role(Rol.ADMINISTRADOR)


def test_cambiar_estado_registra_historial(crear_usuario):
    admin = crear_usuario(email="admin@example.com", rol=Rol.ADMINISTRADOR)
    user = crear_usuario()
    user.cambiar_estado("inactivo", "Fin de contrato", admin)
    user.refresh_from_db()
    assert not user.is_active
    entrada = UserEstadoHistorial.objects.get(usuario=user)
    assert (entrada.estado, entrada.motivo, entrada.modificado_por) == (
        "inactivo",
        "Fin de contrato",
        admin,
    )


def test_cambiar_estado_exige_motivo(crear_usuario):
    user = crear_usuario()
    with pytest.raises(ValueError):
        user.cambiar_estado("inactivo", "  ", user)
    user.refresh_from_db()
    assert user.is_active


def test_sync_roles_es_idempotente(roles):
    from django.core.management import call_command

    antes = {g.name: set(g.permissions.values_list("pk", flat=True)) for g in Group.objects.all()}
    call_command("sync_roles", verbosity=0)
    despues = {g.name: set(g.permissions.values_list("pk", flat=True)) for g in Group.objects.all()}
    assert antes == despues
    assert set(despues) == set(Rol.values)


@pytest.mark.parametrize(
    ("rol", "permiso", "esperado"),
    [
        (Rol.ADMINISTRADOR, "catalogs.change_configuracion", True),
        (Rol.ADMINISTRADOR, "accounts.add_user", True),
        (Rol.SUPERVISOR, "assets.add_equipo", True),
        (Rol.SUPERVISOR, "operations.delete_ordendetrabajo", True),
        (Rol.SUPERVISOR, "accounts.add_user", False),
        (Rol.SUPERVISOR, "catalogs.change_configuracion", False),
        (Rol.INGENIERO_DE_OFICINA, "operations.add_solicitud", True),
        (Rol.INGENIERO_DE_OFICINA, "operations.delete_solicitud", False),
        (Rol.INGENIERO_DE_OFICINA, "operations.add_ordendetrabajo", False),
        (Rol.TECNICO_DE_CAMPO, "operations.change_trabajo", True),
        (Rol.TECNICO_DE_CAMPO, "operations.add_trabajofoto", True),
        (Rol.TECNICO_DE_CAMPO, "operations.add_solicitud", False),
        (Rol.TECNICO_DE_CAMPO, "assets.view_equipo", True),
    ],
)
def test_permisos_por_rol(crear_usuario, rol, permiso, esperado):
    user = crear_usuario(rol=rol)
    assert user.has_perm(permiso) is esperado


def test_todos_los_permisos_de_roles_existen(roles):
    # sync_roles falla si roles.py referencia un permiso inexistente; aquí además
    # se comprueba que el administrador cubre todos los modelos del dominio.
    admin = Group.objects.get(name=Rol.ADMINISTRADOR)
    dominio = Permission.objects.filter(content_type__app_label__in=APPS_DEL_DOMINIO)
    assert admin.permissions.count() == dominio.count()
