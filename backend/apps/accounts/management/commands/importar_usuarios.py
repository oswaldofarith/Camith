"""Importa usuarios exportados de Firebase (ver frontend/scripts/exportar-firestore.mjs).

Política de contraseñas acordada para la migración:
- Los usuarios importados quedan SIN contraseña usable y no se les envía correo;
  cada uno la define con "¿Olvidaste tu contraseña?" en la nueva aplicación.
- El administrador indicado con --admin-email recibe una contraseña temporal
  (variable ADMIN_TEMP_PASSWORD o solicitada por consola) y debe cambiarla en
  su primer inicio de sesión.

Es idempotente: al volver a ejecutarlo actualiza perfiles y roles, pero nunca
toca la contraseña de un usuario que ya existía (ni la del administrador si ya
la cambió).
"""

import getpass
import json
import os
from datetime import datetime
from pathlib import Path

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Skill, User, UserEstadoHistorial
from apps.accounts.roles import Rol

LARGO_MINIMO_TEMPORAL = 12


class Command(BaseCommand):
    help = "Importa usuarios de Firebase; solo el administrador recibe contraseña (temporal)."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default="firestore-export", help="Carpeta de la exportación")
        parser.add_argument("--admin-email", required=True, help="Email del administrador")

    def handle(self, *args, **options):
        carpeta = Path(options["dir"])
        admin_email = options["admin_email"].strip().lower()
        perfiles = self._leer(carpeta / "users.json")
        cuentas = {c["uid"]: c for c in self._leer(carpeta / "auth_users.json")}

        if not any(self._email(p, cuentas) == admin_email for p in perfiles) and not (
            User.objects.filter(email=admin_email).exists()
        ):
            raise CommandError(f"{admin_email} no está en la exportación ni en la base de datos.")

        call_command("sync_roles", verbosity=0)
        grupos = {g.name: g for g in Group.objects.filter(name__in=Rol.values)}

        creados = actualizados = omitidos = 0
        with transaction.atomic():
            usuarios_por_uid = {}
            for perfil in perfiles:
                email = self._email(perfil, cuentas)
                if not email:
                    self.stderr.write(f"Omitido {perfil['id']}: no tiene email.")
                    omitidos += 1
                    continue
                user, creado = self._guardar_usuario(perfil, email, cuentas.get(perfil["id"]))
                user.groups.set([grupos[r] for r in perfil.get("perfiles") or [] if r in grupos])
                user.habilidades.set(
                    [
                        Skill.objects.get_or_create(nombre=h)[0]
                        for h in perfil.get("habilidades") or []
                    ]
                )
                usuarios_por_uid[perfil["id"]] = user
                creados += creado
                actualizados += not creado

            for perfil in perfiles:
                if perfil["id"] in usuarios_por_uid:
                    self._importar_historial(
                        usuarios_por_uid[perfil["id"]], perfil, usuarios_por_uid
                    )

            admin = User.objects.get(email=admin_email)
            # Solo se asigna la temporal si el admin aún no eligió su contraseña.
            if not admin.has_usable_password() or admin.debe_cambiar_password:
                admin.set_password(self._password_temporal())
                admin.debe_cambiar_password = True
            admin.is_active = admin.is_staff = admin.is_superuser = True
            admin.save()
            admin.groups.add(grupos[Rol.ADMINISTRADOR])

        sin_perfil = set(cuentas) - {p["id"] for p in perfiles}
        if sin_perfil:
            self.stderr.write(f"{len(sin_perfil)} cuentas de Auth sin perfil no se importaron.")
        self.stdout.write(
            self.style.SUCCESS(
                f"Usuarios creados: {creados}, actualizados: {actualizados}, omitidos: {omitidos}. "
                f"{admin_email} tiene contraseña temporal; el resto debe usar la recuperación."
            )
        )

    # --- utilidades -----------------------------------------------------------

    def _leer(self, ruta: Path) -> list[dict]:
        if not ruta.exists():
            raise CommandError(f"No existe {ruta}")
        return json.loads(ruta.read_text(encoding="utf-8"))

    @staticmethod
    def _email(perfil: dict, cuentas: dict) -> str:
        email = perfil.get("email") or (cuentas.get(perfil["id"]) or {}).get("email") or ""
        return email.strip().lower()

    def _password_temporal(self) -> str:
        password = os.environ.get("ADMIN_TEMP_PASSWORD")
        if not password:
            password = getpass.getpass("Contraseña temporal del administrador: ")
            if password != getpass.getpass("Repítela: "):
                raise CommandError("Las contraseñas no coinciden.")
        if len(password) < LARGO_MINIMO_TEMPORAL:
            raise CommandError(
                f"La contraseña temporal necesita {LARGO_MINIMO_TEMPORAL} caracteres."
            )
        return password

    def _guardar_usuario(self, perfil: dict, email: str, cuenta: dict | None):
        uid = perfil["id"]
        user = (
            User.objects.filter(firebase_uid=uid).first()
            or User.objects.filter(email=email).first()
        )
        creado = user is None
        if creado:
            user = User(email=email)
            user.set_unusable_password()

        cedula = (perfil.get("cedula") or "").strip() or None
        if cedula and User.objects.filter(cedula=cedula).exclude(pk=user.pk).exists():
            self.stderr.write(f"Cédula duplicada {cedula} en {email}; se deja vacía.")
            cedula = None

        user.firebase_uid = uid
        user.email = email
        user.nombre = (perfil.get("nombre") or email).strip()
        user.cedula = cedula
        user.numero_rol = (perfil.get("numeroRol") or "").strip()
        user.is_active = perfil.get("estado") != "inactivo" and not (cuenta or {}).get("disabled")
        user.save()
        return user, creado

    def _importar_historial(self, user: User, perfil: dict, usuarios_por_uid: dict):
        if user.estado_historial.exists():
            return  # ya importado en una ejecución anterior
        UserEstadoHistorial.objects.bulk_create(
            UserEstadoHistorial(
                usuario=user,
                estado=entrada.get("estado") or "activo",
                fecha=datetime.fromisoformat(entrada["fecha"].replace("Z", "+00:00")),
                modificado_por=usuarios_por_uid.get(entrada.get("modificadoPor")),
                motivo=entrada.get("motivo") or "",
            )
            for entrada in perfil.get("estadoHistorial") or []
            if entrada.get("fecha")
        )
