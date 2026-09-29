from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from .api import api

admin.site.site_header = "AMI-FieldWorkManager"
admin.site.site_title = "AMI-FieldWorkManager"

urlpatterns = [
    path("admin/", admin.site.urls),
    # Login, logout, sesión y reseteo de contraseña (allauth headless).
    path("api/auth/", include("allauth.headless.urls")),
    path("api/", api.urls),
]

if settings.DEBUG:
    from django.conf.urls.static import static

    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
