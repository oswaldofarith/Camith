from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError
from django.db.models import ProtectedError
from ninja import NinjaAPI
from ninja.security import django_auth

from apps.accounts.api import router as accounts_router
from apps.assets.api import router as assets_router
from apps.catalogs.api import router as catalogs_router
from apps.core.api import router as core_router
from apps.notifications.api import router as notifications_router
from apps.operations.api import router as operations_router

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
api.add_router("/accounts", accounts_router)
api.add_router("/catalogos", catalogs_router)
api.add_router("/", assets_router)
api.add_router("/", operations_router)
api.add_router("/notificaciones", notifications_router)


@api.exception_handler(ValidationError)
def error_validacion(request, exc: ValidationError):
    errores = exc.message_dict if hasattr(exc, "error_dict") else {"__all__": exc.messages}
    return api.create_response(
        request, {"detail": "; ".join(exc.messages), "errores": errores}, status=400
    )


@api.exception_handler(PermissionDenied)
def permiso_denegado(request, exc: PermissionDenied):
    mensaje = str(exc) or "No tienes permiso para realizar esta acción."
    return api.create_response(request, {"detail": mensaje}, status=403)


@api.exception_handler(ProtectedError)
def registro_protegido(request, exc: ProtectedError):
    return api.create_response(
        request,
        {"detail": "No se puede eliminar porque otros registros dependen de él."},
        status=409,
    )


@api.exception_handler(IntegrityError)
def conflicto(request, exc: IntegrityError):
    return api.create_response(
        request, {"detail": "El registro entra en conflicto con otro existente."}, status=409
    )
