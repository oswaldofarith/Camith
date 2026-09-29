from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin

from .models import Equipo, EquipoEstadoHistorial, Vehiculo


@admin.register(Vehiculo)
class VehiculoAdmin(admin.ModelAdmin):
    list_display = ("placa", "codigo", "tipo", "estado", "custodio")
    list_filter = ("tipo", "estado")
    search_fields = ("placa", "codigo")
    autocomplete_fields = ("custodio",)


class EquipoEstadoHistorialInline(admin.TabularInline):
    model = EquipoEstadoHistorial
    extra = 0
    readonly_fields = ("estado", "fecha", "modificado_por", "motivo")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Equipo)
class EquipoAdmin(GISModelAdmin):
    list_display = ("codigo", "tipo", "marca", "zona", "estado", "fecha_ultima_revision")
    list_filter = ("tipo", "marca", "zona", "estado", "requiere_canasta", "zona_peligrosa")
    search_fields = ("codigo", "direccion", "ip")
    inlines = [EquipoEstadoHistorialInline]
