"""Roles de la aplicación, implementados como grupos de Django.

Los permisos replican las reglas que existían en `firestore.rules`. Las
restricciones a nivel de objeto (p. ej. un técnico solo edita los trabajos de
sus propias órdenes) se validan en la API, no aquí.
"""

from django.db import models


class Rol(models.TextChoices):
    ADMINISTRADOR = "administrador", "Administrador"
    SUPERVISOR = "supervisor", "Supervisor"
    INGENIERO_DE_OFICINA = "ingenieroDeOficina", "Ingeniero de oficina"
    TECNICO_DE_CAMPO = "tecnicoDeCampo", "Técnico de campo"


APPS_DEL_DOMINIO = ["accounts", "catalogs", "assets", "operations", "notifications"]

TODAS = ("view", "add", "change", "delete")

# Todos los usuarios autenticados pueden consultar la información operativa.
# Los datos personales de los usuarios (email, cédula, historial) no: solo el
# administrador tiene accounts.view_user; el resto usa /accounts/directorio.
_LECTURA_GENERAL = {
    f"{app}.{modelo}": ("view",)
    for app, modelo in [
        ("accounts", "skill"),
        ("catalogs", "marca"),
        ("catalogs", "zona"),
        ("catalogs", "tipoequipo"),
        ("catalogs", "tipotrabajo"),
        ("catalogs", "estadoequipo"),
        ("catalogs", "tipovehiculo"),
        ("catalogs", "estadovehiculo"),
        ("catalogs", "urgencia"),
        ("catalogs", "respuestapredefinida"),
        ("catalogs", "localidad"),
        ("catalogs", "configuracion"),
        ("assets", "vehiculo"),
        ("assets", "equipo"),
        ("operations", "solicitud"),
        ("operations", "unidaddecampo"),
        ("operations", "ordendetrabajo"),
        ("operations", "otunidadasignada"),
        ("operations", "trabajo"),
        ("operations", "trabajofoto"),
        ("operations", "planmantenimiento"),
        ("operations", "mantenimientoprogramado"),
    ]
}

_GESTION_OPERATIVA = {
    f"{app}.{modelo}": TODAS
    for app, modelo in [
        ("assets", "vehiculo"),
        ("assets", "equipo"),
        ("assets", "equipoestadohistorial"),
        ("operations", "solicitud"),
        ("operations", "unidaddecampo"),
        ("operations", "ordendetrabajo"),
        ("operations", "otunidadasignada"),
        ("operations", "trabajo"),
        ("operations", "trabajofoto"),
        ("operations", "planmantenimiento"),
        ("operations", "mantenimientoprogramado"),
    ]
}

# Permisos explícitos por rol. El administrador recibe además todos los
# permisos de APPS_DEL_DOMINIO (ver `sync_roles`).
PERMISOS_POR_ROL: dict[str, dict[str, tuple[str, ...]]] = {
    Rol.ADMINISTRADOR: {},
    Rol.SUPERVISOR: {**_LECTURA_GENERAL, **_GESTION_OPERATIVA},
    Rol.INGENIERO_DE_OFICINA: {
        **_LECTURA_GENERAL,
        "operations.solicitud": ("view", "add", "change"),
        "operations.ordendetrabajo": ("view", "change"),
        "operations.trabajo": ("view", "change"),
    },
    Rol.TECNICO_DE_CAMPO: {
        **_LECTURA_GENERAL,
        "operations.trabajo": ("view", "change"),
        "operations.trabajofoto": ("view", "add"),
    },
}
