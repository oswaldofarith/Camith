import json
from pathlib import Path

from config.api import api

ESQUEMA = Path(__file__).resolve().parent.parent / "openapi.json"


def test_openapi_json_actualizado():
    """El frontend genera sus tipos desde openapi.json: debe reflejar la API actual.

    Si falla, ejecutar:
    python manage.py export_openapi_schema --api config.api.api --output openapi.json --indent 2
    y luego `npm run api:types` en frontend/.
    """
    assert json.loads(ESQUEMA.read_text()) == json.loads(json.dumps(api.get_openapi_schema()))


def test_nombres_de_esquema_unicos():
    """Dos esquemas con el mismo nombre se pisan en el OpenAPI (y en los tipos del frontend)."""
    import collections

    from ninja import Schema

    def subclases(cls):
        for sub in cls.__subclasses__():
            yield sub
            yield from subclases(sub)

    por_nombre = collections.defaultdict(set)
    for cls in subclases(Schema):
        if cls.__module__.startswith("apps."):
            por_nombre[cls.__name__].add(cls.__module__)
    repetidos = {n: m for n, m in por_nombre.items() if len(m) > 1}
    assert not repetidos, repetidos
