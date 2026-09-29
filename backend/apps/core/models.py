from django.db import models, transaction
from django.utils import timezone


class TimeStampedModel(models.Model):
    creado_en = models.DateTimeField("creado en", auto_now_add=True)
    actualizado_en = models.DateTimeField("actualizado en", auto_now=True)

    class Meta:
        abstract = True


class Secuencia(models.Model):
    """Contador diario por prefijo para generar IDs legibles (OT-20260929-001)."""

    prefijo = models.CharField(max_length=10)
    fecha = models.DateField()
    ultimo = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "secuencia"
        constraints = [
            models.UniqueConstraint(
                fields=["prefijo", "fecha"], name="secuencia_prefijo_fecha_unica"
            ),
        ]

    def __str__(self):
        return f"{self.prefijo} {self.fecha:%Y-%m-%d}: {self.ultimo}"


def siguiente_display_id(prefijo: str, fecha=None) -> str:
    """Devuelve el siguiente ID legible del día, p. ej. `SOL-20260929-004`.

    Bloquea la fila del contador (`SELECT ... FOR UPDATE`) para que dos
    peticiones concurrentes nunca obtengan el mismo número.
    """
    fecha = fecha or timezone.localdate()
    with transaction.atomic():
        Secuencia.objects.get_or_create(prefijo=prefijo, fecha=fecha)
        secuencia = Secuencia.objects.select_for_update().get(prefijo=prefijo, fecha=fecha)
        secuencia.ultimo += 1
        secuencia.save(update_fields=["ultimo"])
    return f"{prefijo}-{fecha:%Y%m%d}-{secuencia.ultimo:03d}"
