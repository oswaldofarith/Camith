from ninja import Router

from .schemas import MeOut

router = Router(tags=["usuarios"])


@router.get("/me", response=MeOut)
def me(request):
    user = request.user
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
