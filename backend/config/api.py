from django.contrib.admin.views.decorators import staff_member_required
from ninja import NinjaAPI
from ninja.security import django_auth

from apps.accounts.api import router as accounts_router
from apps.core.api import router as core_router

# Autenticación por sesión de Django (cookie + CSRF) en todos los endpoints,
# salvo los que declaren `auth=None` explícitamente.
api = NinjaAPI(
    title="AMI-FieldWorkManager API",
    version="1.0.0",
    auth=django_auth,
    urls_namespace="api",
    # La documentación OpenAPI solo es visible para usuarios con acceso al admin.
    docs_decorator=staff_member_required,
)

api.add_router("/", core_router)
api.add_router("/accounts/", accounts_router)
