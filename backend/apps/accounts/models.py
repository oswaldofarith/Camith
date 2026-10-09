from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models, transaction
from django.utils import timezone

from apps.core.uploads import RutaAleatoria

from .roles import Rol


class Skill(models.Model):
    """Habilidad de un técnico (Eléctrico, Escalador, Conductor tipo C...)."""

    nombre = models.CharField(max_length=80, unique=True)

    class Meta:
        verbose_name = "habilidad"
        verbose_name_plural = "habilidades"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("El email es obligatorio.")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            raise ValueError("Un superusuario debe tener is_staff=True e is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField("email", unique=True)
    nombre = models.CharField("nombre completo", max_length=150)
    cedula = models.CharField("cédula", max_length=20, unique=True, null=True, blank=True)
    numero_rol = models.CharField("número de rol", max_length=30, blank=True)
    foto = models.ImageField(upload_to=RutaAleatoria("usuarios/fotos"), blank=True)
    habilidades = models.ManyToManyField(Skill, blank=True, related_name="usuarios")

    is_active = models.BooleanField(
        "activo",
        default=True,
        help_text="Los usuarios inactivos no pueden iniciar sesión.",
    )
    is_staff = models.BooleanField(
        "acceso al admin",
        default=False,
        help_text="Permite entrar al panel /admin/ de Django.",
    )
    date_joined = models.DateTimeField("fecha de alta", default=timezone.now)
    debe_cambiar_password = models.BooleanField(
        "debe cambiar la contraseña",
        default=False,
        help_text="Obliga a cambiar la contraseña (temporal) en el próximo inicio de sesión.",
    )

    # UID de Firebase Auth, solo para la migración de datos desde Firestore.
    firebase_uid = models.CharField(max_length=128, unique=True, null=True, blank=True)

    objects = UserManager()

    EMAIL_FIELD = "email"
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["nombre"]

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"
        ordering = ["nombre"]

    def __str__(self):
        return f"{self.nombre} <{self.email}>"

    def get_full_name(self):
        return self.nombre

    def get_short_name(self):
        return self.nombre.split(" ")[0] if self.nombre else self.email

    @property
    def estado(self) -> str:
        return "activo" if self.is_active else "inactivo"

    @property
    def perfiles(self) -> list[str]:
        """Roles del usuario con los mismos valores que usaba Firestore.

        Un superusuario es administrador aunque no esté en el grupo (p. ej., uno
        creado con `createsuperuser`): así lo trata `has_role` y así lo ve el frontend.
        """
        validos = set(Rol.values)
        perfiles = {g.name for g in self.groups.all() if g.name in validos}
        if self.is_superuser:
            perfiles.add(Rol.ADMINISTRADOR.value)
        return sorted(perfiles)

    def has_role(self, *roles: str) -> bool:
        if self.is_superuser and Rol.ADMINISTRADOR in roles:
            return True
        return any(r in roles for r in self.perfiles)

    def cambiar_estado(self, nuevo_estado: str, motivo: str, modificado_por: "User"):
        """Activa o desactiva la cuenta y deja constancia en el historial."""
        if nuevo_estado not in ("activo", "inactivo"):
            raise ValueError(f"Estado no válido: {nuevo_estado}")
        if not motivo.strip():
            raise ValueError("El motivo es obligatorio.")
        with transaction.atomic():
            self.is_active = nuevo_estado == "activo"
            self.save(update_fields=["is_active"])
            UserEstadoHistorial.objects.create(
                usuario=self,
                estado=nuevo_estado,
                modificado_por=modificado_por,
                motivo=motivo,
            )


class UserEstadoHistorial(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="estado_historial")
    estado = models.CharField(
        max_length=10, choices=[("activo", "Activo"), ("inactivo", "Inactivo")]
    )
    fecha = models.DateTimeField(default=timezone.now)
    modificado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+")
    motivo = models.TextField()

    class Meta:
        verbose_name = "cambio de estado de usuario"
        verbose_name_plural = "historial de estados de usuarios"
        ordering = ["-fecha"]

    def __str__(self):
        return f"{self.usuario} → {self.estado} ({self.fecha:%Y-%m-%d})"
