from django.conf import settings
from django.contrib.gis.db import models
from django.utils import timezone

from apps.catalogs.models import EstadoEquipo, EstadoVehiculo, Marca, TipoEquipo, TipoVehiculo, Zona
from apps.core.models import TimeStampedModel


class Vehiculo(TimeStampedModel):
    codigo = models.CharField(
        max_length=50, unique=True, help_text="Identificador interno (el antiguo ID de Firestore)."
    )
    placa = models.CharField(max_length=15, unique=True)
    tipo = models.ForeignKey(TipoVehiculo, on_delete=models.PROTECT, related_name="vehiculos")
    estado = models.ForeignKey(EstadoVehiculo, on_delete=models.PROTECT, related_name="vehiculos")
    custodio = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vehiculos_en_custodia",
    )

    class Meta:
        verbose_name = "vehículo"
        verbose_name_plural = "vehículos"
        ordering = ["placa"]

    def __str__(self):
        return f"{self.placa} ({self.tipo})"


class Equipo(TimeStampedModel):
    class TipoComunicacion(models.TextChoices):
        FIBRA = "Fibra óptica", "Fibra óptica"
        CELULAR = "Celular", "Celular"

    codigo = models.CharField(
        max_length=50,
        unique=True,
        help_text="Identificador del equipo (el antiguo ID de Firestore).",
    )
    tipo = models.ForeignKey(TipoEquipo, on_delete=models.PROTECT, related_name="equipos")
    marca = models.ForeignKey(Marca, on_delete=models.PROTECT, related_name="equipos")
    zona = models.ForeignKey(Zona, on_delete=models.PROTECT, related_name="equipos")
    estado = models.ForeignKey(EstadoEquipo, on_delete=models.PROTECT, related_name="equipos")

    direccion = models.CharField(max_length=255)
    ubicacion = models.PointField(srid=4326, spatial_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    tipo_comunicacion = models.CharField(max_length=20, choices=TipoComunicacion.choices)
    piloto = models.CharField(max_length=100, blank=True)

    fecha_fabricacion = models.DateField(null=True, blank=True)
    fecha_ultima_revision = models.DateTimeField(null=True, blank=True)
    revision_count = models.PositiveIntegerField(default=0)
    requiere_canasta = models.BooleanField(default=False)
    zona_peligrosa = models.BooleanField(default=False)

    proximo_mantenimiento_programado = models.DateField(null=True, blank=True)
    intervalo_mantenimiento_dias = models.PositiveIntegerField(null=True, blank=True)
    intervalo_mantenimiento_revisiones = models.PositiveIntegerField(null=True, blank=True)

    campos_adicionales = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "equipo"
        verbose_name_plural = "equipos"
        ordering = ["codigo"]
        indexes = [models.Index(fields=["zona", "tipo"])]

    def __str__(self):
        return f"{self.codigo} – {self.tipo} {self.marca}"

    @property
    def latitud(self) -> float:
        return self.ubicacion.y

    @property
    def longitud(self) -> float:
        return self.ubicacion.x


class EquipoEstadoHistorial(models.Model):
    equipo = models.ForeignKey(Equipo, on_delete=models.CASCADE, related_name="estado_historial")
    estado = models.ForeignKey(EstadoEquipo, on_delete=models.PROTECT, related_name="+")
    fecha = models.DateTimeField(default=timezone.now)
    modificado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    motivo = models.TextField(blank=True)

    class Meta:
        verbose_name = "cambio de estado de equipo"
        verbose_name_plural = "historial de estados de equipos"
        ordering = ["-fecha"]

    def __str__(self):
        return f"{self.equipo} → {self.estado} ({self.fecha:%Y-%m-%d})"
