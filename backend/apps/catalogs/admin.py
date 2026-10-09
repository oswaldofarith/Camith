from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from solo.admin import SingletonModelAdmin

from . import models


class CatalogoAdmin(admin.ModelAdmin):
    list_display = ("etiqueta", "valor", "activo", "orden")
    list_editable = ("activo", "orden")
    list_filter = ("activo",)
    search_fields = ("etiqueta", "valor")
    prepopulated_fields = {"valor": ("etiqueta",)}


for modelo in (
    models.Marca,
    models.Zona,
    models.EstadoEquipo,
    models.TipoVehiculo,
    models.EstadoVehiculo,
    models.Urgencia,
    models.RespuestaPredefinida,
):
    admin.site.register(modelo, CatalogoAdmin)


class TipoTrabajoInline(admin.TabularInline):
    model = models.TipoTrabajo
    extra = 1


@admin.register(models.TipoEquipo)
class TipoEquipoAdmin(CatalogoAdmin):
    inlines = [TipoTrabajoInline]


@admin.register(models.TipoTrabajo)
class TipoTrabajoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "tipo_equipo", "tiempo_estimado_minutos", "activo")
    list_filter = ("tipo_equipo", "activo")
    search_fields = ("nombre",)


@admin.register(models.Localidad)
class LocalidadAdmin(GISModelAdmin):
    search_fields = ("nombre",)


@admin.register(models.Configuracion)
class ConfiguracionAdmin(SingletonModelAdmin, GISModelAdmin):
    pass
