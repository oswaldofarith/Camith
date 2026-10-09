from django.db import migrations

HABILIDADES = [
    "Eléctrico",
    "Telecomunicaciones",
    "Escalador",
    "Conductor tipo C",
    "Conductor tipo D",
]


def crear(apps, schema_editor):
    Skill = apps.get_model("accounts", "Skill")
    for nombre in HABILIDADES:
        Skill.objects.get_or_create(nombre=nombre)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [migrations.RunPython(crear, migrations.RunPython.noop)]
