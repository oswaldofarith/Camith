from ninja.errors import HttpError


def exigir_permiso(request, *permisos: str) -> None:
    """Responde 403 si el usuario no tiene todos los permisos indicados."""
    if not request.user.has_perms(permisos):
        raise HttpError(403, "No tienes permiso para realizar esta acción.")


def exigir(condicion: bool, mensaje: str = "No tienes permiso para realizar esta acción.") -> None:
    if not condicion:
        raise HttpError(403, mensaje)
