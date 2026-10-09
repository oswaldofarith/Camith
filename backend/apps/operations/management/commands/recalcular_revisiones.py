"""Ajusta las revisiones de cada equipo a sus trabajos completados.

    python manage.py recalcular_revisiones --simular   # solo muestra los cambios
    python manage.py recalcular_revisiones

Firebase no mantenía revisionCount ni fechaUltimaRevision, así que tras la
migración todos los equipos quedaron como "nunca revisados" y el planificador de
mantenimiento los prioriza mal. Es idempotente y nunca baja un valor.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.operations.services import recalcular_revisiones


def _fecha(valor) -> str:
    return timezone.localtime(valor).strftime("%Y-%m-%d %H:%M") if valor else "—"


class Command(BaseCommand):
    help = "Recalcula revision_count y fecha_ultima_revision desde los trabajos completados."

    def add_arguments(self, parser):
        parser.add_argument(
            "--simular", action="store_true", help="Mostrar los cambios sin guardarlos"
        )

    def handle(self, *args, **options):
        simular = options["simular"]
        with transaction.atomic():
            cambios = recalcular_revisiones(guardar=not simular)
        for equipo, revisiones, fecha in cambios:
            self.stdout.write(
                f"{equipo.codigo}: revisiones {revisiones} → {equipo.revision_count}, "
                f"última {_fecha(fecha)} → {_fecha(equipo.fecha_ultima_revision)}"
            )
        if not cambios:
            self.stdout.write(self.style.SUCCESS("Todos los equipos ya estaban al día."))
        elif simular:
            self.stdout.write(
                self.style.WARNING(
                    f"Simulación: {len(cambios)} equipos cambiarían; no se guardó nada."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS(f"{len(cambios)} equipos actualizados."))
