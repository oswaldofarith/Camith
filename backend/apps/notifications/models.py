from django.conf import settings
from django.db import models
from django.utils import timezone


class Notificacion(models.Model):
    class Tipo(models.TextChoices):
        NUEVA_SOLICITUD = "nueva_solicitud", "Nueva solicitud"
        SOLICITUD_ASIGNADA = "solicitud_asignada", "Solicitud asignada"
        SOLICITUD_CANCELADA = "solicitud_cancelada", "Solicitud cancelada"
        NUEVA_OT = "nueva_ot", "Nueva orden de trabajo"
        TRABAJO_COMPLETADO = "trabajo_completado", "Trabajo completado"
        TRABAJO_NO_COMPLETADO = "trabajo_no_completado", "Trabajo no completado"
        TRABAJO_REVISADO = "trabajo_revisado", "Trabajo revisado"
        TRABAJO_CANCELADO = "trabajo_cancelado", "Trabajo cancelado"
        INFO_GENERAL = "info_general", "Información general"

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notificaciones"
    )
    mensaje = models.TextField()
    tipo = models.CharField(max_length=30, choices=Tipo.choices, default=Tipo.INFO_GENERAL)
    fecha_creacion = models.DateTimeField(default=timezone.now)
    leida = models.BooleanField(default=False)
    entidad_id = models.CharField(max_length=60, blank=True)
    entidad_url = models.CharField(max_length=255, blank=True)
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    # ID del documento en Firestore, solo para la migración de datos.
    firestore_id = models.CharField(max_length=128, unique=True, null=True, blank=True)

    class Meta:
        verbose_name = "notificación"
        verbose_name_plural = "notificaciones"
        ordering = ["-fecha_creacion"]
        indexes = [models.Index(fields=["usuario", "leida", "-fecha_creacion"])]

    def __str__(self):
        return f"{self.usuario}: {self.mensaje[:40]}"
