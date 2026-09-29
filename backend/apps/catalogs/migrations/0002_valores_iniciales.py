"""Valores iniciales de los catálogos, tomados de los tipos del frontend."""

from django.db import migrations

VALORES = {
    "Marca": [("honeywell", "Honeywell"), ("itron", "Itron"), ("trilliant", "Trilliant")],
    "Zona": [
        ("norte", "Norte"),
        ("centro", "Centro"),
        ("sur", "Sur"),
        ("via-a-la-costa", "Vía a la Costa"),
        ("perimetral", "Perimetral"),
    ],
    "TipoEquipo": [("colector", "Colector"), ("repetidor", "Repetidor"), ("medidor", "Medidor")],
    "EstadoEquipo": [("activo", "Activo"), ("dado-de-baja", "Dado de baja")],
    "TipoVehiculo": [
        ("camionetaCabinaSimple", "Camioneta cabina simple"),
        ("camionetaCabinaDoble", "Camioneta cabina doble"),
        ("camionCanasta", "Camión canasta"),
    ],
    "EstadoVehiculo": [
        ("disponible", "Disponible"),
        ("enMantenimiento", "En mantenimiento"),
        ("dadoDeBaja", "Dado de baja"),
    ],
    "Urgencia": [("urgente", "Urgente"), ("normal", "Normal")],
}


def crear(apps, schema_editor):
    for modelo, valores in VALORES.items():
        Modelo = apps.get_model("catalogs", modelo)
        for orden, (valor, etiqueta) in enumerate(valores):
            Modelo.objects.get_or_create(
                valor=valor, defaults={"etiqueta": etiqueta, "orden": orden}
            )


class Migration(migrations.Migration):
    dependencies = [("catalogs", "0001_initial")]

    operations = [migrations.RunPython(crear, migrations.RunPython.noop)]
