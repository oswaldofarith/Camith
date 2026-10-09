from datetime import datetime

from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.pagination import PageNumberPagination, paginate

from .models import Notificacion

router = Router(tags=["notificaciones"])


class NotificacionOut(Schema):
    id: int
    mensaje: str
    tipo: str
    fecha_creacion: datetime
    leida: bool
    entidad_id: str
    entidad_url: str
    creada_por_id: int | None
    creada_por_nombre: str | None

    @staticmethod
    def resolve_creada_por_nombre(obj):
        return obj.creada_por.nombre if obj.creada_por else None


@router.get("", response=list[NotificacionOut])
@paginate(PageNumberPagination, page_size=30)
def listar(request, no_leidas: bool = False):
    qs = Notificacion.objects.filter(usuario=request.user).select_related("creada_por")
    return qs.filter(leida=False) if no_leidas else qs


class ConteoOut(Schema):
    no_leidas: int


class MarcadasOut(Schema):
    marcadas: int


@router.get("/conteo", response=ConteoOut)
def conteo(request):
    return {"no_leidas": Notificacion.objects.filter(usuario=request.user, leida=False).count()}


@router.post("/{int:notificacion_id}/leer", response=NotificacionOut)
def marcar_leida(request, notificacion_id: int):
    notificacion = get_object_or_404(Notificacion, pk=notificacion_id, usuario=request.user)
    notificacion.leida = True
    notificacion.save(update_fields=["leida"])
    return notificacion


@router.post("/leer-todas", response=MarcadasOut)
def marcar_todas(request):
    n = Notificacion.objects.filter(usuario=request.user, leida=False).update(leida=True)
    return {"marcadas": n}
