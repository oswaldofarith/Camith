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
