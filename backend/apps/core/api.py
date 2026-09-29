from django.db import connection
from django.middleware.csrf import get_token
from ninja import Router

router = Router(tags=["sistema"])


@router.get("/health", auth=None)
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return {"status": "ok"}


@router.get("/csrf", auth=None)
def csrf(request):
    """Fija la cookie `csrftoken` para que el frontend pueda enviar X-CSRFToken."""
    return {"csrfToken": get_token(request)}


@router.get("/media-auth", include_in_schema=False)
def media_auth(request):
    """Caddy consulta este endpoint (forward_auth) antes de servir /media/*.

    Solo los usuarios con sesión activa pueden ver fotos subidas.
    """
    return {"ok": True}
