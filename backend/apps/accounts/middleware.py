from django.http import JsonResponse

# Lo único que puede usar quien tiene una contraseña temporal: cambiarla o cerrar
# sesión (allauth) y saber quién es.
PREFIJOS_PERMITIDOS = ("/api/auth/",)
RUTAS_PERMITIDAS = {"/api/accounts/me", "/api/csrf", "/api/health"}


class PasswordTemporalMiddleware:
    """Mientras el usuario tenga una contraseña temporal, la API solo le deja
    cambiarla. El frontend ya lo redirige, pero el servidor no puede fiarse de eso."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ruta = request.path
        if (
            ruta.startswith("/api/")
            and ruta not in RUTAS_PERMITIDAS
            and not ruta.startswith(PREFIJOS_PERMITIDOS)
            and request.user.is_authenticated
            and request.user.debe_cambiar_password
        ):
            return JsonResponse(
                {"detail": "Debes cambiar tu contraseña temporal antes de continuar."},
                status=403,
            )
        return self.get_response(request)
