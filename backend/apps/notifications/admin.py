from django.contrib import admin

from .models import Notificacion


@admin.register(Notificacion)
class NotificacionAdmin(admin.ModelAdmin):
    list_display = ("usuario", "tipo", "mensaje", "leida", "fecha_creacion")
    list_filter = ("tipo", "leida")
    search_fields = ("mensaje", "usuario__email", "usuario__nombre")
    autocomplete_fields = ("usuario", "creada_por")
