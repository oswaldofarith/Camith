from datetime import date, timedelta

from django.db import transaction
from django.db.models import Count, Prefetch
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import File, Query, Router, UploadedFile
from ninja.pagination import PageNumberPagination, paginate
from ninja.responses import Status

from apps.accounts.models import User
from apps.assets.models import Vehiculo
from apps.core.permisos import exigir, exigir_permiso

from . import services
from .models import (
    OrdenDeTrabajo,
    OTUnidadAsignada,
    PlanMantenimiento,
    Solicitud,
    Trabajo,
    TrabajoFoto,
    UnidadDeCampo,
)
from .planificador import planificar
from .schemas import (
    FotoOut,
    GenerarPlanIn,
    GenerarSolicitudesIn,
    GenerarSolicitudesOut,
    KpisOut,
    MotivoIn,
    OrdenDetalleOut,
    OrdenIn,
    OrdenOut,
    PlanDetalleOut,
    PlanIn,
    PlanOut,
    PlanPatch,
    PrevisualizacionOut,
    ReporteIn,
    RevisionIn,
    SolicitudIn,
    SolicitudOut,
    SolicitudPatch,
    TendenciaDia,
    TrabajoOut,
    UnidadCampoSchema,
)

router = Router(tags=["operaciones"])

T = Trabajo.Estado

# --- Solicitudes ------------------------------------------------------------------


def _solicitudes():
    return Solicitud.objects.select_related("equipo", "tipo_trabajo", "urgencia", "creado_por")


@router.get("/solicitudes", response=list[SolicitudOut])
@paginate(PageNumberPagination, page_size=50)
def listar_solicitudes(
    request,
    estado: list[str] = Query(None),
    equipo: str | None = None,
    urgencia: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    mias: bool = False,
):
    """`desde`/`hasta` filtran por fecha programada; `mias` por creador."""
    exigir_permiso(request, "operations.view_solicitud")
    qs = _solicitudes()
    if estado:
        qs = qs.filter(estado__in=estado)
    if equipo:
        qs = qs.filter(equipo__codigo=equipo)
    if urgencia:
        qs = qs.filter(urgencia__valor=urgencia)
    if desde:
        qs = qs.filter(fecha_programada__gte=desde)
    if hasta:
        qs = qs.filter(fecha_programada__lte=hasta)
    if mias:
        qs = qs.filter(creado_por=request.user)
    return qs


@router.get("/solicitudes/{int:solicitud_id}", response=SolicitudOut)
def obtener_solicitud(request, solicitud_id: int):
    exigir_permiso(request, "operations.view_solicitud")
    return get_object_or_404(_solicitudes(), pk=solicitud_id)


@router.post("/solicitudes", response={201: SolicitudOut})
def crear_solicitud(request, payload: SolicitudIn):
    exigir_permiso(request, "operations.add_solicitud")
    solicitud = services.crear_solicitud(payload.dict(), request.user)
    return Status(201, _solicitudes().get(pk=solicitud.pk))


@router.patch("/solicitudes/{int:solicitud_id}", response=SolicitudOut)
def editar_solicitud(request, solicitud_id: int, payload: SolicitudPatch):
    exigir_permiso(request, "operations.change_solicitud")
    solicitud = get_object_or_404(Solicitud, pk=solicitud_id)
    services.actualizar_solicitud(solicitud, payload.dict(exclude_unset=True))
    return _solicitudes().get(pk=solicitud_id)


@router.post("/solicitudes/{int:solicitud_id}/cancelar", response=SolicitudOut)
def cancelar_solicitud(request, solicitud_id: int, payload: MotivoIn):
    exigir_permiso(request, "operations.change_solicitud")
    solicitud = get_object_or_404(Solicitud, pk=solicitud_id)
    services.cancelar_solicitud(solicitud, payload.motivo, request.user)
    return _solicitudes().get(pk=solicitud_id)


@router.delete("/solicitudes/{int:solicitud_id}", response={204: None})
def borrar_solicitud(request, solicitud_id: int):
    """Falla con 409 si la solicitud ya forma parte de una orden de trabajo."""
    exigir_permiso(request, "operations.delete_solicitud")
    services.borrar_solicitud(get_object_or_404(Solicitud, pk=solicitud_id))
    return Status(204, None)


# --- Unidades de campo ----------------------------------------------------------


@router.get("/unidades-campo", response=list[UnidadCampoSchema])
def listar_unidades(request):
    exigir_permiso(request, "operations.view_unidaddecampo")
    return [
        {"vehiculo": u.vehiculo.codigo, "tecnicos": [t.pk for t in u.tecnicos.all()]}
        for u in UnidadDeCampo.objects.select_related("vehiculo").prefetch_related("tecnicos")
    ]


@router.put("/unidades-campo", response=list[UnidadCampoSchema])
def guardar_unidades(request, payload: list[UnidadCampoSchema]):
    """Reemplaza todas las composiciones por defecto de las cuadrillas."""
    exigir_permiso(
        request,
        "operations.add_unidaddecampo",
        "operations.change_unidaddecampo",
        "operations.delete_unidaddecampo",
    )
    with transaction.atomic():
        UnidadDeCampo.objects.all().delete()
        for item in payload:
            unidad = UnidadDeCampo.objects.create(
                vehiculo=get_object_or_404(Vehiculo, codigo=item.vehiculo)
            )
            unidad.tecnicos.set(User.objects.filter(pk__in=item.tecnicos))
    return listar_unidades(request)


# --- Órdenes de trabajo -----------------------------------------------------------


def _trabajos():
    return Trabajo.objects.select_related(
        "orden",
        "solicitud",
        "tipo_trabajo",
        "equipo__tipo",
        "equipo__marca",
        "equipo__zona",
    ).prefetch_related("fotos")


def _ordenes(con_trabajos: bool = False):
    trabajos = _trabajos() if con_trabajos else Trabajo.objects.only("id", "orden_id", "estado")
    return OrdenDeTrabajo.objects.select_related("creado_por").prefetch_related(
        Prefetch(
            "unidades_asignadas",
            queryset=OTUnidadAsignada.objects.select_related("vehiculo").prefetch_related(
                "tecnicos"
            ),
        ),
        Prefetch("trabajos", queryset=trabajos),
    )


@router.get("/ordenes", response=list[OrdenOut])
@paginate(PageNumberPagination, page_size=50)
def listar_ordenes(
    request,
    estado: list[str] = Query(None),
    desde: date | None = None,
    hasta: date | None = None,
    tecnico: int | None = None,
):
    """`desde`/`hasta` filtran por fecha de creación; `tecnico` por técnico asignado."""
    exigir_permiso(request, "operations.view_ordendetrabajo")
    qs = _ordenes()
    if estado:
        qs = qs.filter(estado_general__in=estado)
    if desde:
        qs = qs.filter(fecha_creacion__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha_creacion__date__lte=hasta)
    if tecnico:
        qs = qs.filter(unidades_asignadas__tecnicos=tecnico).distinct()
    return qs


@router.get("/ordenes/{int:orden_id}", response=OrdenDetalleOut)
def obtener_orden(request, orden_id: int):
    exigir_permiso(request, "operations.view_ordendetrabajo")
    return get_object_or_404(_ordenes(con_trabajos=True), pk=orden_id)


@router.post("/ordenes", response={201: list[OrdenDetalleOut]})
def crear_ordenes(request, payload: list[OrdenIn]):
    """Crea una o varias OT (p. ej., todas las rutas del tablero de planificación)."""
    exigir_permiso(request, "operations.add_ordendetrabajo")
    ordenes = services.crear_ordenes([o.dict() for o in payload], request.user)
    return Status(201, list(_ordenes(con_trabajos=True).filter(pk__in=[o.pk for o in ordenes])))


@router.delete("/ordenes/{int:orden_id}", response={204: None})
def borrar_orden(request, orden_id: int):
    exigir_permiso(request, "operations.delete_ordendetrabajo")
    services.eliminar_orden(get_object_or_404(OrdenDeTrabajo, pk=orden_id))
    return Status(204, None)


# --- Trabajos ---------------------------------------------------------------------


@router.get("/trabajos", response=list[TrabajoOut])
@paginate(PageNumberPagination, page_size=50)
def listar_trabajos(
    request,
    equipo: str | None = None,
    estado: list[str] = Query(None),
    tecnico: int | None = None,
    desde: date | None = None,
    hasta: date | None = None,
):
    """Historial de trabajos. `desde`/`hasta` filtran por fecha de la orden."""
    exigir_permiso(request, "operations.view_trabajo")
    qs = _trabajos()
    if equipo:
        qs = qs.filter(equipo__codigo=equipo)
    if estado:
        qs = qs.filter(estado__in=estado)
    if tecnico:
        qs = qs.filter(orden__unidades_asignadas__tecnicos=tecnico).distinct()
    if desde:
        qs = qs.filter(orden__fecha_creacion__date__gte=desde)
    if hasta:
        qs = qs.filter(orden__fecha_creacion__date__lte=hasta)
    return qs.order_by("-orden__fecha_creacion", "secuencia")


@router.get("/trabajos/mios", response=list[TrabajoOut])
def mis_trabajos(
    request,
    estado: list[str] = Query(None),
    desde: date | None = None,
    hasta: date | None = None,
):
    """Trabajos de las órdenes donde el usuario es técnico asignado."""
    exigir_permiso(request, "operations.view_trabajo")
    qs = _trabajos().filter(orden__unidades_asignadas__tecnicos=request.user).distinct()
    if estado:
        qs = qs.filter(estado__in=estado)
    if desde:
        qs = qs.filter(orden__fecha_creacion__date__gte=desde)
    if hasta:
        qs = qs.filter(orden__fecha_creacion__date__lte=hasta)
    return qs.order_by("-orden__fecha_creacion", "secuencia")


def _trabajo(trabajo_id: int) -> Trabajo:
    return get_object_or_404(Trabajo.objects.select_related("orden"), pk=trabajo_id)


@router.get("/trabajos/{int:trabajo_id}", response=TrabajoOut)
def obtener_trabajo(request, trabajo_id: int):
    exigir_permiso(request, "operations.view_trabajo")
    return get_object_or_404(_trabajos(), pk=trabajo_id)


@router.post("/trabajos/{int:trabajo_id}/reportar", response=TrabajoOut)
def reportar_trabajo(request, trabajo_id: int, payload: ReporteIn):
    """El técnico asignado (o un supervisor) marca el trabajo como completado o no."""
    trabajo = _trabajo(trabajo_id)
    exigir(
        services.puede_reportar(request.user, trabajo),
        "Solo los técnicos asignados a esta orden pueden reportar el trabajo.",
    )
    services.cambiar_trabajo(
        trabajo,
        request.user,
        estado=payload.estado,
        detalles=payload.detalles,
        hallazgos=payload.hallazgos,
    )
    return obtener_trabajo(request, trabajo_id)


@router.post("/trabajos/{int:trabajo_id}/revisar", response=TrabajoOut)
def revisar_trabajo(request, trabajo_id: int, payload: RevisionIn):
    """Ingeniero, supervisor o administrador: cambia el estado u observa el trabajo."""
    exigir(services.puede_revisar(request.user))
    trabajo = _trabajo(trabajo_id)
    exigir(trabajo.estado != T.CANCELADO, "No se puede revisar un trabajo cancelado.")
    cambios = payload.dict(exclude_unset=True)
    services.cambiar_trabajo(trabajo, request.user, **cambios)
    return obtener_trabajo(request, trabajo_id)


@router.post("/trabajos/{int:trabajo_id}/cancelar", response=TrabajoOut)
def cancelar_trabajo(request, trabajo_id: int, payload: MotivoIn):
    trabajo = _trabajo(trabajo_id)
    exigir(services.puede_gestionar_ot(request.user))
    exigir(trabajo.estado != T.CANCELADO, "El trabajo ya está cancelado.")
    services.cambiar_trabajo(
        trabajo, request.user, estado=T.CANCELADO, motivo_cancelacion=payload.motivo
    )
    return obtener_trabajo(request, trabajo_id)


@router.post("/trabajos/{int:trabajo_id}/fotos", response={201: list[FotoOut]})
def subir_fotos(request, trabajo_id: int, fotos: File[list[UploadedFile]]):
    trabajo = _trabajo(trabajo_id)
    exigir(
        request.user.has_perm("operations.add_trabajofoto")
        and (
            services.puede_gestionar_ot(request.user)
            or services.esta_asignado(request.user, trabajo.orden)
        )
    )
    return Status(201, services.agregar_fotos(trabajo, fotos, request.user))


@router.delete("/trabajos/{int:trabajo_id}/fotos/{int:foto_id}", response={204: None})
def borrar_foto(request, trabajo_id: int, foto_id: int):
    foto = get_object_or_404(TrabajoFoto, pk=foto_id, trabajo_id=trabajo_id)
    exigir(foto.subida_por_id == request.user.pk or services.puede_gestionar_ot(request.user))
    foto.imagen.delete(save=False)
    foto.delete()
    return Status(204, None)


# --- Planes de mantenimiento ------------------------------------------------------


@router.get("/planes-mantenimiento", response=list[PlanOut])
def listar_planes(request):
    exigir_permiso(request, "operations.view_planmantenimiento")
    return PlanMantenimiento.objects.all()


def _plan(plan_id: int):
    return get_object_or_404(
        PlanMantenimiento.objects.prefetch_related("calendario__equipo"), pk=plan_id
    )


@router.get("/planes-mantenimiento/{int:plan_id}", response=PlanDetalleOut)
def obtener_plan(request, plan_id: int):
    exigir_permiso(request, "operations.view_planmantenimiento")
    return _plan(plan_id)


@router.post("/planes-mantenimiento", response={201: PlanDetalleOut})
def crear_plan(request, payload: PlanIn):
    exigir_permiso(request, "operations.add_planmantenimiento")
    plan = services.crear_plan(payload.dict(), request.user)
    return Status(201, _plan(plan.pk))


@router.post("/planes-mantenimiento/previsualizar", response=PrevisualizacionOut)
def previsualizar_plan(request, payload: GenerarPlanIn):
    """Calcula el calendario sin guardarlo."""
    exigir_permiso(request, "operations.view_planmantenimiento")
    datos = payload.dict()
    return planificar(
        datos["exclusiones"], datos["tiempo_de_ejecucion_dias"], datos["fecha_inicio"]
    )


@router.post("/planes-mantenimiento/generar", response={201: PlanDetalleOut})
def generar_plan(request, payload: GenerarPlanIn):
    """Calcula el calendario con reglas fijas y guarda el plan como activo."""
    exigir_permiso(request, "operations.add_planmantenimiento")
    plan = services.generar_plan(payload.dict(), request.user)
    return Status(201, _plan(plan.pk))


@router.patch("/planes-mantenimiento/{int:plan_id}", response=PlanDetalleOut)
def editar_plan(request, plan_id: int, payload: PlanPatch):
    exigir_permiso(request, "operations.change_planmantenimiento")
    plan = get_object_or_404(PlanMantenimiento, pk=plan_id)
    for campo, valor in payload.dict(exclude_unset=True).items():
        setattr(plan, campo, valor)
    plan.full_clean()
    plan.save()
    return _plan(plan_id)


@router.delete("/planes-mantenimiento/{int:plan_id}", response={204: None})
def borrar_plan(request, plan_id: int):
    exigir_permiso(request, "operations.delete_planmantenimiento")
    get_object_or_404(PlanMantenimiento, pk=plan_id).delete()
    return Status(204, None)


@router.post(
    "/planes-mantenimiento/{int:plan_id}/generar-solicitudes", response=GenerarSolicitudesOut
)
def generar_solicitudes(request, plan_id: int, payload: GenerarSolicitudesIn):
    exigir_permiso(request, "operations.change_planmantenimiento", "operations.add_solicitud")
    plan = get_object_or_404(PlanMantenimiento, pk=plan_id)
    creadas, errores = services.generar_solicitudes_plan(
        plan, request.user, payload.items, payload.tipo_trabajo, payload.urgencia
    )
    return {"creadas": creadas, "errores": errores}


# --- Dashboard --------------------------------------------------------------------


@router.get("/dashboard/kpis", response=KpisOut)
def kpis(request):
    exigir_permiso(request, "operations.view_ordendetrabajo")
    hoy = timezone.localdate()
    trabajos = Trabajo.objects.all()
    return {
        "ordenes_del_dia": OrdenDeTrabajo.objects.filter(fecha_creacion__date=hoy).count(),
        "trabajos_pendientes_total": trabajos.filter(estado=T.PENDIENTE).count(),
        "trabajos_completados_hoy": trabajos.filter(
            estado=T.COMPLETADO, fecha_finalizacion__date=hoy
        ).count(),
        "trabajos_pendientes_creados_hoy": trabajos.filter(
            estado=T.PENDIENTE, orden__fecha_creacion__date=hoy
        ).count(),
        "trabajos_no_completados_creados_hoy": trabajos.filter(
            estado=T.NO_COMPLETADO,
            orden__fecha_creacion__date=hoy,
            fecha_finalizacion__date=hoy,
        ).count(),
        "solicitudes_pendientes": Solicitud.objects.filter(
            estado=Solicitud.Estado.PENDIENTE
        ).count(),
    }


@router.get("/dashboard/tendencias", response=list[TendenciaDia])
def tendencias(request, dias: int = 14):
    """Órdenes creadas y sus trabajos por estado, por día de creación de la orden."""
    exigir_permiso(request, "operations.view_ordendetrabajo")
    dias = max(1, min(dias, 90))
    hoy = timezone.localdate()
    desde = hoy - timedelta(days=dias - 1)
    serie = {
        desde + timedelta(days=i): {
            "ordenes": 0,
            "pendientes": 0,
            "completados": 0,
            "no_completados": 0,
            "cancelados": 0,
        }
        for i in range(dias)
    }
    # Hasta hoy: una orden con fecha futura no tiene casilla en la serie.
    ordenes = (
        OrdenDeTrabajo.objects.filter(fecha_creacion__date__range=(desde, hoy))
        .annotate(dia=TruncDate("fecha_creacion"))
        .values("dia")
        .annotate(n=Count("id"))
    )
    for r in ordenes:
        serie[r["dia"]]["ordenes"] = r["n"]
    campo = {
        T.PENDIENTE: "pendientes",
        T.COMPLETADO: "completados",
        T.NO_COMPLETADO: "no_completados",
        T.CANCELADO: "cancelados",
    }
    trabajos = (
        Trabajo.objects.filter(orden__fecha_creacion__date__range=(desde, hoy))
        .annotate(dia=TruncDate("orden__fecha_creacion"))
        .values("dia", "estado")
        .annotate(n=Count("id"))
    )
    for r in trabajos:
        serie[r["dia"]][campo[r["estado"]]] = r["n"]
    return [{"fecha": d, **v} for d, v in serie.items()]
