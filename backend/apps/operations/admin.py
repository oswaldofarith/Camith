from django.contrib import admin

from . import models


@admin.register(models.Solicitud)
class SolicitudAdmin(admin.ModelAdmin):
    list_display = (
        "display_id",
        "equipo",
        "tipo_trabajo",
        "urgencia",
        "estado",
        "fecha_programada",
    )
    list_filter = ("estado", "urgencia", "fecha_programada")
    search_fields = ("display_id", "equipo__codigo", "descripcion")
    autocomplete_fields = ("equipo", "creado_por")
    date_hierarchy = "fecha_programada"


@admin.register(models.UnidadDeCampo)
class UnidadDeCampoAdmin(admin.ModelAdmin):
    filter_horizontal = ("tecnicos",)


class OTUnidadAsignadaInline(admin.TabularInline):
    model = models.OTUnidadAsignada
    extra = 0
    filter_horizontal = ("tecnicos",)


class TrabajoInline(admin.StackedInline):
    model = models.Trabajo
    fk_name = "orden"
    extra = 0
    readonly_fields = ("codigo",)
    autocomplete_fields = ("equipo", "solicitud")


@admin.register(models.OrdenDeTrabajo)
class OrdenDeTrabajoAdmin(admin.ModelAdmin):
    list_display = ("display_id", "fecha_creacion", "creado_por", "estado_general")
    list_filter = ("estado_general",)
    search_fields = ("display_id",)
    date_hierarchy = "fecha_creacion"
    inlines = [OTUnidadAsignadaInline, TrabajoInline]


class TrabajoFotoInline(admin.TabularInline):
    model = models.TrabajoFoto
    extra = 0


@admin.register(models.Trabajo)
class TrabajoAdmin(admin.ModelAdmin):
    list_display = (
        "codigo",
        "equipo",
        "tipo_trabajo",
        "estado",
        "completado_por",
        "fecha_finalizacion",
    )
    list_filter = ("estado", "requiere_nueva_revision")
    search_fields = ("codigo", "equipo__codigo", "solicitud__display_id")
    inlines = [TrabajoFotoInline]


class MantenimientoProgramadoInline(admin.TabularInline):
    model = models.MantenimientoProgramado
    extra = 0
    autocomplete_fields = ("equipo",)


@admin.register(models.PlanMantenimiento)
class PlanMantenimientoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "estado", "fecha_creacion", "tiempo_de_ejecucion_dias")
    list_filter = ("estado",)
    inlines = [MantenimientoProgramadoInline]
