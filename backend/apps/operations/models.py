from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from apps.assets.models import Equipo, Vehiculo
from apps.catalogs.models import TipoTrabajo, Urgencia
from apps.core.models import TimeStampedModel, siguiente_display_id
from apps.core.uploads import RutaAleatoria

User = settings.AUTH_USER_MODEL


class Solicitud(TimeStampedModel):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        ASIGNADA = "asignada", "Asignada"
        CANCELADA = "cancelada", "Cancelada"
        COMPLETADA = "completada", "Completada"
        NO_COMPLETADA = "no_completada", "No completada"

    display_id = models.CharField(max_length=30, unique=True, editable=False)
    equipo = models.ForeignKey(Equipo, on_delete=models.PROTECT, related_name="solicitudes")
    fecha_solicitud = models.DateTimeField(default=timezone.now)
    fecha_programada = models.DateField()
    tipo_trabajo = models.ForeignKey(TipoTrabajo, on_delete=models.PROTECT, related_name="+")
    tiempo_servicio_estimado = models.PositiveIntegerField(
        "tiempo de servicio estimado (min)", null=True, blank=True
    )
    urgencia = models.ForeignKey(Urgencia, on_delete=models.PROTECT, related_name="+")
    descripcion = models.TextField(blank=True)
    creado_por = models.ForeignKey(User, on_delete=models.PROTECT, related_name="solicitudes")
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    motivo_cancelacion = models.TextField(blank=True)

    # ID del documento en Firestore, solo para la migración de datos.
    firestore_id = models.CharField(max_length=128, unique=True, null=True, blank=True)

    class Meta:
        verbose_name = "solicitud"
        verbose_name_plural = "solicitudes"
        ordering = ["-fecha_solicitud"]
        indexes = [models.Index(fields=["estado", "fecha_programada"])]

    def __str__(self):
        return self.display_id

    def save(self, *args, **kwargs):
        if not self.display_id:
            self.display_id = siguiente_display_id("SOL")
        super().save(*args, **kwargs)


class UnidadDeCampo(models.Model):
    """Composición por defecto de una cuadrilla: un vehículo y sus técnicos."""

    vehiculo = models.OneToOneField(Vehiculo, on_delete=models.CASCADE, related_name="unidad")
    tecnicos = models.ManyToManyField(User, blank=True, related_name="unidades_de_campo")

    class Meta:
        verbose_name = "unidad de campo"
        verbose_name_plural = "unidades de campo"

    def __str__(self):
        return f"Unidad {self.vehiculo.placa}"


class OrdenDeTrabajo(TimeStampedModel):
    class Estado(models.TextChoices):
        PENDIENTE = "Pendiente", "Pendiente"
        EN_PROGRESO = "En Progreso", "En progreso"
        COMPLETADA_PARCIAL = "CompletadaParcial", "Completada parcialmente"
        COMPLETADA_TOTAL = "CompletadaTotal", "Completada"
        CANCELADA = "Cancelada", "Cancelada"

    display_id = models.CharField(max_length=30, unique=True, editable=False)
    fecha_creacion = models.DateTimeField(default=timezone.now)
    creado_por = models.ForeignKey(User, on_delete=models.PROTECT, related_name="ordenes_creadas")
    estado_general = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.PENDIENTE
    )
    firestore_id = models.CharField(max_length=128, unique=True, null=True, blank=True)

    class Meta:
        verbose_name = "orden de trabajo"
        verbose_name_plural = "órdenes de trabajo"
        ordering = ["-fecha_creacion"]

    def __str__(self):
        return self.display_id

    def save(self, *args, **kwargs):
        if not self.display_id:
            self.display_id = siguiente_display_id("OT")
        super().save(*args, **kwargs)

    @staticmethod
    def calcular_estado(estados_trabajos: list[str]) -> str:
        """Estado global de la OT a partir del estado de sus trabajos."""
        E, T = OrdenDeTrabajo.Estado, Trabajo.Estado
        total = len(estados_trabajos)
        if total == 0:
            return E.PENDIENTE
        pendientes = estados_trabajos.count(T.PENDIENTE)
        completados = estados_trabajos.count(T.COMPLETADO)
        cancelados = estados_trabajos.count(T.CANCELADO)
        if pendientes:
            return E.EN_PROGRESO if pendientes < total else E.PENDIENTE
        if cancelados == total:
            return E.CANCELADA
        if completados == total:
            return E.COMPLETADA_TOTAL
        return E.COMPLETADA_PARCIAL

    def recalcular_estado(self, guardar: bool = True) -> str:
        self.estado_general = self.calcular_estado(
            list(self.trabajos.values_list("estado", flat=True))
        )
        if guardar:
            self.save(update_fields=["estado_general", "actualizado_en"])
        return self.estado_general

    def tecnicos_asignados(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.filter(unidades_asignadas_ot__orden=self).distinct()


class OTUnidadAsignada(models.Model):
    """Vehículo y técnicos asignados a una ruta dentro de una OT."""

    orden = models.ForeignKey(
        OrdenDeTrabajo, on_delete=models.CASCADE, related_name="unidades_asignadas"
    )
    ruta_id = models.CharField(max_length=60, blank=True)
    vehiculo = models.ForeignKey(Vehiculo, on_delete=models.PROTECT, related_name="asignaciones")
    tecnicos = models.ManyToManyField(User, related_name="unidades_asignadas_ot")

    class Meta:
        verbose_name = "unidad asignada"
        verbose_name_plural = "unidades asignadas"

    def __str__(self):
        return f"{self.orden} · {self.vehiculo.placa}"


class Trabajo(TimeStampedModel):
    class Estado(models.TextChoices):
        PENDIENTE = "Pendiente", "Pendiente"
        COMPLETADO = "Completado", "Completado"
        NO_COMPLETADO = "No Completado", "No completado"
        CANCELADO = "Cancelado", "Cancelado"

    orden = models.ForeignKey(OrdenDeTrabajo, on_delete=models.CASCADE, related_name="trabajos")
    codigo = models.CharField(max_length=40, unique=True, editable=False)
    secuencia = models.PositiveSmallIntegerField(editable=False)
    equipo = models.ForeignKey(Equipo, on_delete=models.PROTECT, related_name="trabajos")
    solicitud = models.ForeignKey(Solicitud, on_delete=models.PROTECT, related_name="trabajos")
    tipo_trabajo = models.ForeignKey(TipoTrabajo, on_delete=models.PROTECT, related_name="+")
    tiempo_servicio_estimado = models.PositiveIntegerField(null=True, blank=True)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)

    detalles = models.TextField(blank=True)
    hallazgos = models.TextField(blank=True)
    completado_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="trabajos_completados"
    )
    fecha_finalizacion = models.DateTimeField(null=True, blank=True)

    observacion_ingeniero = models.TextField(blank=True)
    observacion_ingeniero_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    fecha_observacion_ingeniero = models.DateTimeField(null=True, blank=True)
    requiere_nueva_revision = models.BooleanField(default=False)
    fecha_nueva_revision = models.DateField(null=True, blank=True)
    motivo_cancelacion = models.TextField(blank=True)

    class Meta:
        verbose_name = "trabajo"
        verbose_name_plural = "trabajos"
        ordering = ["orden", "secuencia"]
        constraints = [
            models.UniqueConstraint(fields=["orden", "secuencia"], name="trabajo_secuencia_unica"),
        ]
        indexes = [models.Index(fields=["estado", "fecha_finalizacion"])]

    def __str__(self):
        return self.codigo

    def save(self, *args, **kwargs):
        if not self.codigo:
            with transaction.atomic():
                # Bloquea la OT para numerar sus trabajos sin colisiones.
                orden = OrdenDeTrabajo.objects.select_for_update().get(pk=self.orden_id)
                ultimo = orden.trabajos.aggregate(m=models.Max("secuencia"))["m"] or 0
                self.secuencia = ultimo + 1
                self.codigo = f"{orden.display_id}-T{self.secuencia}"
                super().save(*args, **kwargs)
            return
        super().save(*args, **kwargs)


class TrabajoFoto(models.Model):
    trabajo = models.ForeignKey(Trabajo, on_delete=models.CASCADE, related_name="fotos")
    imagen = models.ImageField(upload_to=RutaAleatoria("trabajos/fotos"))
    subida_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+")
    subida_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "foto de trabajo"
        verbose_name_plural = "fotos de trabajos"
        ordering = ["subida_en"]

    def __str__(self):
        return f"Foto {self.pk} de {self.trabajo}"


class PlanMantenimiento(TimeStampedModel):
    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        ACTIVO = "activo", "Activo"
        COMPLETADO = "completado", "Completado"
        ARCHIVADO = "archivado", "Archivado"

    nombre = models.CharField(max_length=150)
    fecha_creacion = models.DateTimeField(default=timezone.now)
    creado_por = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    tiempo_de_ejecucion_dias = models.PositiveIntegerField()
    # Lista de {campo, operador, valor}; ver CriterioExclusion en el frontend.
    exclusiones = models.JSONField(default=list, blank=True)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.BORRADOR)
    estadisticas = models.JSONField(default=dict, blank=True)
    firestore_id = models.CharField(max_length=128, unique=True, null=True, blank=True)

    class Meta:
        verbose_name = "plan de mantenimiento"
        verbose_name_plural = "planes de mantenimiento"
        ordering = ["-fecha_creacion"]

    def __str__(self):
        return self.nombre


class MantenimientoProgramado(models.Model):
    class Estado(models.TextChoices):
        PROGRAMADO = "programado", "Programado"
        SOLICITUD_CREADA = "solicitud_creada", "Solicitud creada"
        COMPLETADO_OT = "completado_ot", "Completado en OT"

    plan = models.ForeignKey(PlanMantenimiento, on_delete=models.CASCADE, related_name="calendario")
    equipo = models.ForeignKey(Equipo, on_delete=models.CASCADE, related_name="+")
    fecha_programada = models.DateField()
    solicitud = models.ForeignKey(
        Solicitud, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PROGRAMADO)
    motivo_prioridad = models.TextField(blank=True)

    class Meta:
        verbose_name = "mantenimiento programado"
        verbose_name_plural = "mantenimientos programados"
        ordering = ["fecha_programada"]

    def __str__(self):
        return f"{self.equipo} · {self.fecha_programada}"
