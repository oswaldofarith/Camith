from ninja import Schema


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
