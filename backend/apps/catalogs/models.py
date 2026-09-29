"""Catálogos configurables que antes vivían en el documento `appConfiguration`."""

from django.contrib.gis.db import models
from solo.models import SingletonModel


class Catalogo(models.Model):
    valor = models.SlugField(
        max_length=60, unique=True, help_text="Identificador estable (no cambiar tras crear)."
    )
    etiqueta = models.CharField(max_length=120)
    activo = models.BooleanField(default=True)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        abstract = True
        ordering = ["orden", "etiqueta"]

    def __str__(self):
        return self.etiqueta


class Marca(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "marca de equipo"
        verbose_name_plural = "marcas de equipos"


class Zona(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "zona"
        verbose_name_plural = "zonas"


class TipoEquipo(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "tipo de equipo"
        verbose_name_plural = "tipos de equipos"


class TipoTrabajo(models.Model):
    tipo_equipo = models.ForeignKey(
        TipoEquipo, on_delete=models.CASCADE, related_name="tipos_de_trabajo"
    )
    nombre = models.CharField(max_length=120)
    tiempo_estimado_minutos = models.PositiveIntegerField(default=30)
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "tipo de trabajo"
        verbose_name_plural = "tipos de trabajo"
        ordering = ["tipo_equipo", "nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["tipo_equipo", "nombre"], name="tipotrabajo_unico_por_tipo_equipo"
            ),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.tipo_equipo})"


class EstadoEquipo(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "estado de equipo"
        verbose_name_plural = "estados de equipos"


class TipoVehiculo(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "tipo de vehículo"
        verbose_name_plural = "tipos de vehículos"


class EstadoVehiculo(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "estado de vehículo"
        verbose_name_plural = "estados de vehículos"


class Urgencia(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "urgencia"
        verbose_name_plural = "urgencias"


class RespuestaPredefinida(Catalogo):
    class Meta(Catalogo.Meta):
        verbose_name = "respuesta predefinida"
        verbose_name_plural = "respuestas predefinidas"


class Localidad(models.Model):
    nombre = models.CharField(max_length=120, unique=True)
    ubicacion = models.PointField(srid=4326)

    class Meta:
        verbose_name = "localidad"
        verbose_name_plural = "localidades"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Configuracion(SingletonModel):
    """Parámetros generales de la empresa y de la jornada de trabajo."""

    empresa_nombre = models.CharField(max_length=150, blank=True)
    empresa_unidad_negocio = models.CharField(max_length=150, blank=True)
    empresa_departamento = models.CharField(max_length=150, blank=True)

    sede_central_nombre = models.CharField(max_length=150, blank=True)
    sede_central_ubicacion = models.PointField(srid=4326, null=True, blank=True)

    hora_inicio_jornada = models.TimeField(null=True, blank=True)
    hora_fin_jornada = models.TimeField(null=True, blank=True)
    minutos_planificacion = models.PositiveIntegerField(default=0)
    minutos_reporte = models.PositiveIntegerField(default=0)
    minutos_almuerzo = models.PositiveIntegerField(default=60)
    hora_inicio_almuerzo = models.TimeField(null=True, blank=True)
    hora_fin_almuerzo = models.TimeField(null=True, blank=True)
    zona_horaria = models.CharField(max_length=64, default="America/Guayaquil")

    class Meta:
        verbose_name = "configuración general"

    def __str__(self):
        return "Configuración general"
