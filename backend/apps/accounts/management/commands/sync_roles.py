from django.apps import apps
from django.contrib.auth.management import create_permissions
from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.roles import APPS_DEL_DOMINIO, PERMISOS_POR_ROL, Rol


class Command(BaseCommand):
    help = "Crea o actualiza los grupos de roles y sus permisos (idempotente)."

    def handle(self, *args, **options):
        # Garantiza que existan los permisos de todos los modelos antes de asignarlos.
        for app_config in apps.get_app_configs():
            create_permissions(app_config, verbosity=0)

        for rol, permisos in PERMISOS_POR_ROL.items():
            grupo, creado = Group.objects.get_or_create(name=rol)
            if rol == Rol.ADMINISTRADOR:
                qs = Permission.objects.filter(content_type__app_label__in=APPS_DEL_DOMINIO)
            else:
                codenames = []
                for etiqueta, acciones in permisos.items():
                    app_label, modelo = etiqueta.split(".")
                    codenames += [(app_label, f"{accion}_{modelo}") for accion in acciones]
                qs = Permission.objects.none()
                for app_label, codename in codenames:
                    qs |= Permission.objects.filter(
                        content_type__app_label=app_label, codename=codename
                    )
                faltantes = len(codenames) - qs.count()
                if faltantes:
                    raise CommandError(f"Rol {rol}: faltan {faltantes} permisos; revise roles.py")
            grupo.permissions.set(qs)
            accion = "creado" if creado else "actualizado"
            self.stdout.write(f"Rol {rol} {accion} ({qs.count()} permisos)")
