from allauth.account.signals import password_changed, password_reset, password_set
from django.dispatch import receiver


@receiver(password_changed)
@receiver(password_reset)
@receiver(password_set)
def limpiar_password_temporal(sender, request, user, **kwargs):
    """Cuando el usuario elige su propia contraseña, deja de ser temporal."""
    if user.debe_cambiar_password:
        user.debe_cambiar_password = False
        user.save(update_fields=["debe_cambiar_password"])
