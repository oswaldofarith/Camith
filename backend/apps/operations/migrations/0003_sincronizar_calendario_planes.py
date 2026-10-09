"""Alinea el calendario de los planes con el estado de sus solicitudes.

Hasta ahora un mantenimiento se quedaba en "solicitud_creada" aunque su solicitud
se completara o se cancelara; desde esta versión lo sincroniza services.py.
"""

from django.db import migrations


def sincronizar(apps, schema_editor):
    Mantenimiento = apps.get_model("operations", "MantenimientoProgramado")
    con_solicitud = Mantenimiento.objects.exclude(solicitud=None)
    con_solicitud.filter(solicitud__estado="completada").update(estado="completado_ot")
    con_solicitud.filter(solicitud__estado="cancelada").update(estado="programado", solicitud=None)
    # Solicitud borrada (on_delete=SET_NULL): se puede volver a pedir.
    Mantenimiento.objects.filter(solicitud=None, estado="solicitud_creada").update(
        estado="programado"
    )


class Migration(migrations.Migration):
    dependencies = [("operations", "0002_firestore_id")]

    operations = [migrations.RunPython(sincronizar, migrations.RunPython.noop)]
