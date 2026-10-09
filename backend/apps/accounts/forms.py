from allauth.account.adapter import get_adapter
from django.contrib.admin.forms import AdminAuthenticationForm


class LoginAdminForm(AdminAuthenticationForm):
    """Login de /admin/ con los mismos límites de intentos fallidos que el de la
    aplicación (allauth: por IP y por email). El de Django no tiene ninguno."""

    def clean(self):
        email = self.cleaned_data.get("username")
        password = self.cleaned_data.get("password")
        if email and password:
            # Lanza ValidationError si se superó el límite de intentos.
            self.user_cache = get_adapter(self.request).authenticate(
                self.request, email=email, password=password
            )
            if self.user_cache is None:
                raise self.get_invalid_login_error()
            self.confirm_login_allowed(self.user_cache)
        return self.cleaned_data
