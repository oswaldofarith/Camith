from collections.abc import Iterable

from apps.accounts.models import User

from .models import Notificacion


def notificar(
    usuarios: Iterable[User],
    mensaje: str,
    tipo: str,
    *,
    creada_por: User | None = None,
    entidad_id: str | int = "",
    entidad_url: str = "",
) -> list[Notificacion]:
    """Crea una notificación por destinatario activo, omitiendo a quien la origina."""
    destinatarios = {u.pk: u for u in usuarios if u.is_active and u != creada_por}
    return Notificacion.objects.bulk_create(
        Notificacion(
            usuario=u,
            mensaje=mensaje,
            tipo=tipo,
            creada_por=creada_por,
            entidad_id=str(entidad_id),
            entidad_url=entidad_url,
        )
        for u in destinatarios.values()
    )


def usuarios_con_rol(*roles: str):
    return User.objects.filter(is_active=True, groups__name__in=roles).distinct()
