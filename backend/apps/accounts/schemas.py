from datetime import datetime

from ninja import Schema
from pydantic import EmailStr, Field

from .roles import Rol


class MeOut(Schema):
    id: int
    email: str
    nombre: str
    cedula: str | None
    numero_rol: str
    foto_url: str | None
    estado: str
    perfiles: list[str]
    habilidades: list[str]
    is_staff: bool
    debe_cambiar_password: bool


class MePatch(Schema):
    nombre: str = Field(min_length=1, max_length=150)


class EstadoHistorialOut(Schema):
    estado: str
    fecha: datetime
    modificado_por_id: int | None
    motivo: str


class UsuarioResumenOut(Schema):
    """Lo que cualquier usuario puede ver de los demás: sin datos personales."""

    id: int
    nombre: str
    foto_url: str | None
    estado: str
    perfiles: list[str]
    habilidades: list[str]

    @staticmethod
    def resolve_foto_url(obj):
        return obj.foto.url if obj.foto else None

    @staticmethod
    def resolve_habilidades(obj):
        return [h.nombre for h in obj.habilidades.all()]


class UsuarioOut(UsuarioResumenOut):
    email: str
    cedula: str | None
    numero_rol: str


class UsuarioDetalleOut(UsuarioOut):
    tiene_password: bool
    debe_cambiar_password: bool
    last_login: datetime | None
    estado_historial: list[EstadoHistorialOut]

    @staticmethod
    def resolve_tiene_password(obj):
        return obj.has_usable_password()

    @staticmethod
    def resolve_estado_historial(obj):
        return list(obj.estado_historial.all())


class UsuarioIn(Schema):
    email: EmailStr
    nombre: str = Field(min_length=1, max_length=150)
    cedula: str | None = None
    numero_rol: str = ""
    perfiles: list[Rol] = []
    habilidades: list[str] = []
    # Si se omite, el usuario define su contraseña con "¿Olvidaste tu contraseña?".
    password: str | None = None


class UsuarioPatch(Schema):
    email: EmailStr | None = None
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    cedula: str | None = None
    numero_rol: str | None = None
    perfiles: list[Rol] | None = None
    habilidades: list[str] | None = None


class EstadoIn(Schema):
    estado: str = Field(pattern="^(activo|inactivo)$")
    motivo: str = Field(min_length=1)


class PasswordTemporalIn(Schema):
    password: str
