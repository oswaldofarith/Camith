"""Migra todos los datos de Firebase: usuarios, catálogos, equipos, vehículos,
solicitudes, órdenes, planes, notificaciones y fotos.

    ADMIN_TEMP_PASSWORD='…' python manage.py importar_datos \\
        --dir /tmp/firestore-export --admin-email admin@empresa.com

Con --simular hace todo dentro de una transacción que se deshace al final, para
revisar los avisos sin tocar la base de datos.
"""

from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.importador_firestore import Importador, descargar_fotos


class Simulacion(Exception):
    pass


class Command(BaseCommand):
    help = "Importa la exportación completa de Firestore (ver legacy/firebase/export)."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default="firestore-export", help="Carpeta de la exportación")
        parser.add_argument("--admin-email", required=True, help="Email del administrador")
        parser.add_argument("--sin-fotos", action="store_true", help="No descargar fotos")
        parser.add_argument(
            "--simular", action="store_true", help="Importar y deshacer (solo muestra el informe)"
        )

    def handle(self, *args, **options):
        carpeta = Path(options["dir"])
        if not carpeta.is_dir():
            raise CommandError(f"No existe la carpeta {carpeta}")

        try:
            with transaction.atomic():
                call_command(
                    "importar_usuarios",
                    dir=str(carpeta),
                    admin_email=options["admin_email"],
                    stdout=self.stdout,
                    stderr=self.stderr,
                )
                informe = Importador(carpeta).importar_todo()
                if options["simular"]:
                    raise Simulacion
        except Simulacion:
            self.stdout.write(self.style.WARNING("Simulación: no se guardó nada."))

        if informe.fotos_pendientes and not (options["sin_fotos"] or options["simular"]):
            self.stdout.write(f"Descargando {len(informe.fotos_pendientes)} fotos…")
            descargar_fotos(informe.fotos_pendientes, informe)

        for aviso in informe.avisos:
            self.stderr.write(f"· {aviso}")
        resumen = ", ".join(f"{k}: {v}" for k, v in informe.creados.items())
        self.stdout.write(self.style.SUCCESS(f"Importado → {resumen or 'nada nuevo'}"))
        if informe.existentes:
            ya = ", ".join(f"{k}: {v}" for k, v in informe.existentes.items())
            self.stdout.write(f"Ya existían (no se tocaron) → {ya}")
        if informe.fotos_pendientes and options["sin_fotos"]:
            self.stdout.write(f"{len(informe.fotos_pendientes)} fotos sin descargar (--sin-fotos).")
