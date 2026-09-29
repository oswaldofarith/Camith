from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from ninja import File, Router, UploadedFile
from ninja.errors import HttpError
from ninja.responses import Status

from apps.core.permisos import exigir, exigir_permiso

from .models import Skill, User
from .roles import Rol
from .schemas import (
    EstadoIn,
    MeOut,
    MePatch,
    PasswordTemporalIn,
    UsuarioDetalleOut,
    UsuarioIn,
    UsuarioOut,
    UsuarioPatch,
)

router = Router(tags=["usuarios"])

TAMANO_MAXIMO_FOTO = 5 * 1024 * 1024


def _me(user: User) -> MeOut:
    return MeOut(
        id=user.pk,
        email=user.email,
        nombre=user.nombre,
        cedula=user.cedula,
        numero_rol=user.numero_rol,
        foto_url=user.foto.url if user.foto else None,
        estado=user.estado,
        perfiles=user.perfiles,
        habilidades=[h.nombre for h in user.habilidades.all()],
        is_staff=user.is_staff,
        debe_cambiar_password=user.debe_cambiar_password,
    )


@router.get("/me", response=MeOut)
def me(request):
    return _me(request.user)


@router.patch("/me", response=MeOut)
def editar_me(request, payload: MePatch):
    request.user.nombre = payload.nombre.strip()
    request.user.save(update_fields=["nombre"])
    return _me(request.user)


@router.post("/me/foto", response=MeOut)
def subir_foto(request, foto: File[UploadedFile]):
    if foto.size > TAMANO_MAXIMO_FOTO:
        raise HttpError(400, "La foto no puede superar 5 MB.")
    user = request.user
    anterior = user.foto.name if user.foto else None
    user.foto = foto
    user.full_clean(validate_unique=False, exclude=["password"])
    user.save(update_fields=["foto"])
    if anterior:
        user.foto.storage.delete(anterior)
    return _me(user)


@router.get("/skills", response=list[str])
def habilidades(request):
    return list(Skill.objects.values_list("nombre", flat=True))


# --- Gestión de usuarios -------------------------------------------------------


def _usuarios():
    return User.objects.prefetch_related("groups", "habilidades")


@router.get("/usuarios", response=list[UsuarioOut])
def listar_usuarios(request, rol: str | None = None, activo: bool | None = None, q: str = ""):
    exigir_permiso(request, "accounts.view_user")
    qs = _usuarios()
    if rol:
        qs = qs.filter(groups__name=rol)
    if activo is not None:
        qs = qs.filter(is_active=activo)
    if q:
        qs = qs.filter(Q(nombre__icontains=q) | Q(email__icontains=q) | Q(cedula__icontains=q))
    return qs


@router.get("/usuarios/{user_id}", response=UsuarioDetalleOut)
def obtener_usuario(request, user_id: int):
    exigir_permiso(request, "accounts.view_user")
    return get_object_or_404(_usuarios().prefetch_related("estado_historial"), pk=user_id)


def _aplicar_roles_y_habilidades(user: User, perfiles, habilidades):
    if perfiles is not None:
        user.groups.set(Group.objects.filter(name__in=perfiles))
    if habilidades is not None:
        user.habilidades.set([Skill.objects.get_or_create(nombre=h)[0] for h in habilidades])


@router.post("/usuarios", response={201: UsuarioDetalleOut})
def crear_usuario(request, payload: UsuarioIn):
    exigir_permiso(request, "accounts.add_user")
    email = payload.email.lower()
    if User.objects.filter(email=email).exists():
        raise HttpError(409, "El correo electrónico ya está en uso por otra cuenta.")
    user = User(
        email=email,
        nombre=payload.nombre.strip(),
        cedula=(payload.cedula or "").strip() or None,
        numero_rol=payload.numero_rol.strip(),
    )
    if payload.password:
        validate_password(payload.password, user)
        user.set_password(payload.password)
        user.debe_cambiar_password = True
    else:
        user.set_unusable_password()
    user.full_clean(exclude=["password"])
    with transaction.atomic():
        user.save()
        _aplicar_roles_y_habilidades(user, payload.perfiles, payload.habilidades)
    return Status(201, _usuarios().get(pk=user.pk))


@router.patch("/usuarios/{user_id}", response=UsuarioDetalleOut)
def editar_usuario(request, user_id: int, payload: UsuarioPatch):
    exigir_permiso(request, "accounts.change_user")
    user = get_object_or_404(User, pk=user_id)
    datos = payload.dict(exclude_unset=True)
    perfiles = datos.pop("perfiles", None)
    habilidades = datos.pop("habilidades", None)
    se_quita_admin = (
        user == request.user
        and perfiles is not None
        and Rol.ADMINISTRADOR not in perfiles
        and Rol.ADMINISTRADOR in user.perfiles
    )
    exigir(not se_quita_admin, "No puedes quitarte el rol de administrador a ti mismo.")
    if "email" in datos:
        datos["email"] = datos["email"].lower()
    if "cedula" in datos:
        datos["cedula"] = (datos["cedula"] or "").strip() or None
    for campo, valor in datos.items():
        setattr(user, campo, valor)
    user.full_clean(exclude=["password"])
    with transaction.atomic():
        user.save()
        _aplicar_roles_y_habilidades(user, perfiles, habilidades)
    return _usuarios().get(pk=user.pk)


@router.post("/usuarios/{user_id}/estado", response=UsuarioDetalleOut)
def cambiar_estado(request, user_id: int, payload: EstadoIn):
    exigir_permiso(request, "accounts.change_user")
    user = get_object_or_404(User, pk=user_id)
    exigir(
        not (user == request.user and payload.estado == "inactivo"),
        "No puedes desactivar tu propia cuenta.",
    )
    user.cambiar_estado(payload.estado, payload.motivo, request.user)
    return _usuarios().get(pk=user.pk)


@router.post("/usuarios/{user_id}/password-temporal", response=UsuarioDetalleOut)
def asignar_password_temporal(request, user_id: int, payload: PasswordTemporalIn):
    """El administrador fija una contraseña que el usuario deberá cambiar al entrar."""
    exigir_permiso(request, "accounts.change_user")
    user = get_object_or_404(User, pk=user_id)
    validate_password(payload.password, user)
    user.set_password(payload.password)
    user.debe_cambiar_password = True
    user.save(update_fields=["password", "debe_cambiar_password"])
    return _usuarios().get(pk=user.pk)
