"""Reglas de negocio de solicitudes, órdenes de trabajo y trabajos.

Portado de `frontend/src/services/workOrderService.ts` y `requestService.ts`,
con la diferencia de que ahora todo ocurre en el servidor y en una transacción.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from apps.accounts.roles import Rol
from apps.assets.models import Equipo, Vehiculo
from apps.catalogs.models import TipoTrabajo, Urgencia
from apps.notifications.models import Notificacion
from apps.notifications.services import notificar, usuarios_con_rol

from .models import (
    MantenimientoProgramado,
    OrdenDeTrabajo,
    OTUnidadAsignada,
    PlanMantenimiento,
    Solicitud,
    Trabajo,
    TrabajoFoto,
)

User = get_user_model()
T = Trabajo.Estado
S = Solicitud.Estado
N = Notificacion.Tipo

MAX_FOTOS_POR_TRABAJO = 5

# --- Permisos a nivel de objeto -------------------------------------------------


def puede_gestionar_ot(usuario) -> bool:
    """Supervisores y administradores: crean, cancelan y eliminan órdenes."""
    return usuario.has_perm("operations.add_ordendetrabajo")


def puede_revisar(usuario) -> bool:
    return usuario.has_role(Rol.ADMINISTRADOR, Rol.SUPERVISOR, Rol.INGENIERO_DE_OFICINA)


def esta_asignado(usuario, orden: OrdenDeTrabajo) -> bool:
    return OTUnidadAsignada.objects.filter(orden=orden, tecnicos=usuario).exists()


def puede_reportar(usuario, trabajo: Trabajo) -> bool:
    """Réplica de la regla de firestore.rules para técnicos."""
    if puede_gestionar_ot(usuario):
        return True
    return (
        usuario.has_perm("operations.change_trabajo")
        and esta_asignado(usuario, trabajo.orden)
        and trabajo.estado != T.CANCELADO
        and (trabajo.estado == T.PENDIENTE or trabajo.completado_por_id == usuario.pk)
    )


# --- Solicitudes ----------------------------------------------------------------


@transaction.atomic
def crear_solicitud(datos: dict, usuario) -> Solicitud:
    equipo = _obtener(Equipo, codigo=datos.pop("equipo"))
    tipo_trabajo = _obtener(TipoTrabajo, pk=datos.pop("tipo_trabajo_id"))
    urgencia = _obtener(Urgencia, valor=datos.pop("urgencia"))
    if tipo_trabajo.tipo_equipo_id != equipo.tipo_id:
        raise ValidationError({"tipo_trabajo_id": "No corresponde al tipo de equipo."})
    if datos.get("tiempo_servicio_estimado") is None:
        datos["tiempo_servicio_estimado"] = tipo_trabajo.tiempo_estimado_minutos
    solicitud = Solicitud(
        equipo=equipo, tipo_trabajo=tipo_trabajo, urgencia=urgencia, creado_por=usuario, **datos
    )
    solicitud.full_clean(exclude=["display_id"])
    solicitud.save()
    notificar(
        usuarios_con_rol(Rol.SUPERVISOR),
        f"Nueva solicitud {solicitud.display_id} para equipo {equipo.codigo} "
        f"creada por {usuario.nombre}.",
        N.NUEVA_SOLICITUD,
        creada_por=usuario,
        entidad_id=solicitud.pk,
        entidad_url="/requests",
    )
    return solicitud


@transaction.atomic
def actualizar_solicitud(solicitud: Solicitud, datos: dict) -> Solicitud:
    solicitud = Solicitud.objects.select_for_update().get(pk=solicitud.pk)
    if solicitud.estado != S.PENDIENTE:
        raise ValidationError("Solo se pueden editar solicitudes pendientes.")
    if "tipo_trabajo_id" in datos:
        solicitud.tipo_trabajo = _obtener(TipoTrabajo, pk=datos.pop("tipo_trabajo_id"))
        if solicitud.tipo_trabajo.tipo_equipo_id != solicitud.equipo.tipo_id:
            raise ValidationError({"tipo_trabajo_id": "No corresponde al tipo de equipo."})
    if "urgencia" in datos:
        solicitud.urgencia = _obtener(Urgencia, valor=datos.pop("urgencia"))
    for campo, valor in datos.items():
        setattr(solicitud, campo, valor)
    solicitud.full_clean()
    solicitud.save()
    return solicitud


@transaction.atomic
def cancelar_solicitud(solicitud: Solicitud, motivo: str, usuario) -> Solicitud:
    solicitud = Solicitud.objects.select_for_update().get(pk=solicitud.pk)
    if solicitud.estado not in (S.PENDIENTE, S.ASIGNADA):
        raise ValidationError(f"No se puede cancelar una solicitud {solicitud.estado}.")
    if solicitud.estado == S.ASIGNADA:
        # Está en una OT: se cancela el trabajo, que a su vez cancela la solicitud.
        if not puede_gestionar_ot(usuario):
            raise PermissionDenied("Solo un supervisor puede cancelar una solicitud asignada.")
        trabajo = solicitud.trabajos.exclude(estado=T.CANCELADO).first()
        if trabajo:
            cambiar_trabajo(trabajo, usuario, estado=T.CANCELADO, motivo_cancelacion=motivo)
            solicitud.refresh_from_db()
    if solicitud.estado != S.CANCELADA:
        solicitud.estado = S.CANCELADA
        solicitud.motivo_cancelacion = motivo
        solicitud.save(update_fields=["estado", "motivo_cancelacion", "actualizado_en"])
    notificar(
        [solicitud.creado_por],
        f"Tu solicitud {solicitud.display_id} fue cancelada por {usuario.nombre}. Motivo: {motivo}",
        N.SOLICITUD_CANCELADA,
        creada_por=usuario,
        entidad_id=solicitud.pk,
        entidad_url="/requests",
    )
    return solicitud


# --- Órdenes de trabajo -----------------------------------------------------------


@transaction.atomic
def crear_ordenes(lotes: list[dict], usuario) -> list[OrdenDeTrabajo]:
    """Crea varias OT a la vez; cada una con sus unidades y solicitudes (en orden de ruta)."""
    ordenes = []
    for lote in lotes:
        ids = lote["solicitudes"]
        if not ids or not lote["unidades"]:
            raise ValidationError("Cada orden necesita al menos una unidad y una solicitud.")
        if len(set(ids)) != len(ids):
            raise ValidationError("Hay solicitudes repetidas en la orden.")
        solicitudes = Solicitud.objects.select_for_update().select_related("equipo").in_bulk(ids)
        faltantes = set(ids) - set(solicitudes)
        if faltantes:
            raise ValidationError(f"Solicitudes inexistentes: {sorted(faltantes)}")
        no_pendientes = [s.display_id for s in solicitudes.values() if s.estado != S.PENDIENTE]
        if no_pendientes:
            raise ValidationError(f"Solicitudes que ya no están pendientes: {no_pendientes}")

        orden = OrdenDeTrabajo.objects.create(creado_por=usuario)
        tecnicos_orden = set()
        for unidad in lote["unidades"]:
            tecnicos = list(User.objects.filter(pk__in=unidad["tecnicos"], is_active=True))
            if len(tecnicos) != len(set(unidad["tecnicos"])):
                raise ValidationError("Algún técnico no existe o está inactivo.")
            asignada = OTUnidadAsignada.objects.create(
                orden=orden,
                ruta_id=unidad.get("ruta_id", ""),
                vehiculo=_obtener(Vehiculo, codigo=unidad["vehiculo"]),
            )
            asignada.tecnicos.set(tecnicos)
            tecnicos_orden.update(tecnicos)

        for solicitud_id in ids:
            solicitud = solicitudes[solicitud_id]
            Trabajo.objects.create(
                orden=orden,
                equipo=solicitud.equipo,
                solicitud=solicitud,
                tipo_trabajo_id=solicitud.tipo_trabajo_id,
                tiempo_servicio_estimado=solicitud.tiempo_servicio_estimado,
            )
            solicitud.estado = S.ASIGNADA
            solicitud.save(update_fields=["estado", "actualizado_en"])
            notificar(
                [solicitud.creado_por],
                f"Tu solicitud {solicitud.display_id} (Eq: {solicitud.equipo.codigo}) fue "
                f"asignada a OT {orden.display_id} por {usuario.nombre}.",
                N.SOLICITUD_ASIGNADA,
                creada_por=usuario,
                entidad_id=solicitud.pk,
                entidad_url="/requests",
            )
        orden.recalcular_estado()
        notificar(
            tecnicos_orden,
            f"Se te ha asignado la Orden de Trabajo {orden.display_id} por {usuario.nombre}. "
            "Revisa tus trabajos.",
            N.NUEVA_OT,
            creada_por=usuario,
            entidad_id=orden.pk,
            entidad_url="/technician/my-jobs",
        )
        ordenes.append(orden)
    return ordenes


@transaction.atomic
def eliminar_orden(orden: OrdenDeTrabajo) -> None:
    """Solo si ningún trabajo avanzó; sus solicitudes vuelven a quedar pendientes."""
    orden = OrdenDeTrabajo.objects.select_for_update().get(pk=orden.pk)
    if orden.trabajos.exclude(estado=T.PENDIENTE).exists():
        raise ValidationError(
            "La orden tiene trabajos reportados o cancelados; no se puede borrar."
        )
    Solicitud.objects.filter(trabajos__orden=orden).update(estado=S.PENDIENTE)
    orden.delete()


# --- Trabajos -----------------------------------------------------------------------

_NO_ENVIADO = object()


@transaction.atomic
def cambiar_trabajo(
    trabajo: Trabajo,
    usuario,
    *,
    estado: str | None = None,
    detalles=_NO_ENVIADO,
    hallazgos=_NO_ENVIADO,
    observacion=_NO_ENVIADO,
    requiere_nueva_revision=_NO_ENVIADO,
    fecha_nueva_revision=_NO_ENVIADO,
    motivo_cancelacion: str = "",
) -> Trabajo:
    """Aplica un cambio a un trabajo y propaga sus efectos (OT, solicitud, equipo, avisos)."""
    trabajo = (
        Trabajo.objects.select_for_update().select_related("orden", "equipo").get(pk=trabajo.pk)
    )
    original = Trabajo.objects.get(pk=trabajo.pk)
    ahora = timezone.now()
    estado = estado or trabajo.estado

    if estado != original.estado:
        if estado in (T.COMPLETADO, T.NO_COMPLETADO):
            if original.estado == T.PENDIENTE:
                trabajo.fecha_finalizacion = ahora
                trabajo.completado_por = usuario
            trabajo.motivo_cancelacion = ""
        elif estado == T.PENDIENTE:
            trabajo.fecha_finalizacion = None
            trabajo.completado_por = None
            trabajo.motivo_cancelacion = ""
            _limpiar_observacion(trabajo)
        elif estado == T.CANCELADO:
            if not motivo_cancelacion.strip():
                raise ValidationError({"motivo": "El motivo de cancelación es obligatorio."})
            trabajo.fecha_finalizacion = ahora
            trabajo.completado_por = usuario
            trabajo.motivo_cancelacion = motivo_cancelacion.strip()
        trabajo.estado = estado

    if detalles is not _NO_ENVIADO:
        trabajo.detalles = detalles or ""
    if hallazgos is not _NO_ENVIADO:
        trabajo.hallazgos = hallazgos or ""
    if requiere_nueva_revision is not _NO_ENVIADO:
        trabajo.requiere_nueva_revision = bool(requiere_nueva_revision)
    if fecha_nueva_revision is not _NO_ENVIADO:
        trabajo.fecha_nueva_revision = fecha_nueva_revision
    if observacion is not _NO_ENVIADO:
        if observacion and observacion.strip():
            trabajo.observacion_ingeniero = observacion.strip()
            trabajo.observacion_ingeniero_por = usuario
            trabajo.fecha_observacion_ingeniero = ahora
        else:
            _limpiar_observacion(trabajo)

    trabajo.full_clean()
    trabajo.save()

    if trabajo.estado != original.estado:
        _sincronizar_solicitud(trabajo)
        _actualizar_revisiones_equipo(trabajo, original.estado)
    trabajo.orden.recalcular_estado()
    _notificar_cambio_trabajo(trabajo, original, usuario, observacion is not _NO_ENVIADO)
    return trabajo


def _limpiar_observacion(trabajo: Trabajo) -> None:
    trabajo.observacion_ingeniero = ""
    trabajo.observacion_ingeniero_por = None
    trabajo.fecha_observacion_ingeniero = None


def _sincronizar_solicitud(trabajo: Trabajo) -> None:
    solicitud = trabajo.solicitud
    if trabajo.estado == T.COMPLETADO:
        solicitud.estado = S.COMPLETADA
    elif trabajo.estado == T.NO_COMPLETADO:
        solicitud.estado = S.NO_COMPLETADA
    elif trabajo.estado == T.CANCELADO:
        solicitud.estado = S.CANCELADA
        solicitud.motivo_cancelacion = trabajo.motivo_cancelacion or "Cancelado desde OT"
    elif trabajo.estado == T.PENDIENTE and solicitud.estado != S.PENDIENTE:
        solicitud.estado = S.ASIGNADA
    solicitud.save(update_fields=["estado", "motivo_cancelacion", "actualizado_en"])


def _actualizar_revisiones_equipo(trabajo: Trabajo, estado_anterior: str) -> None:
    """Cada trabajo completado cuenta como una revisión del equipo."""
    equipo = Equipo.objects.select_for_update().get(pk=trabajo.equipo_id)
    if trabajo.estado == T.COMPLETADO:
        equipo.revision_count = F("revision_count") + 1
        equipo.fecha_ultima_revision = trabajo.fecha_finalizacion
    elif estado_anterior == T.COMPLETADO:
        equipo.revision_count = F("revision_count") - 1 if equipo.revision_count > 0 else 0
        ultima = Trabajo.objects.filter(equipo=equipo, estado=T.COMPLETADO).aggregate(
            m=Max("fecha_finalizacion")
        )["m"]
        if ultima:
            equipo.fecha_ultima_revision = ultima
    else:
        return
    equipo.save(update_fields=["revision_count", "fecha_ultima_revision", "actualizado_en"])


def _notificar_cambio_trabajo(trabajo: Trabajo, original: Trabajo, usuario, hubo_observacion):
    orden = trabajo.orden
    cambio_estado = trabajo.estado != original.estado
    url = f"/work-orders/{orden.pk}"

    # 1) Al ingeniero que creó la solicitud, cuando el trabajo se cierra.
    creador = trabajo.solicitud.creado_por
    if (
        cambio_estado
        and trabajo.estado in (T.COMPLETADO, T.NO_COMPLETADO, T.CANCELADO)
        and creador.has_role(Rol.INGENIERO_DE_OFICINA)
    ):
        base = (
            f"El trabajo {trabajo.codigo} (OT: {orden.display_id}, "
            f"Sol: {trabajo.solicitud.display_id}, Eq: {trabajo.equipo.codigo}) "
        )
        cierre = {
            T.COMPLETADO: ("ha sido marcado como COMPLETADO", N.TRABAJO_COMPLETADO),
            T.NO_COMPLETADO: ("ha sido marcado como NO COMPLETADO", N.TRABAJO_NO_COMPLETADO),
            T.CANCELADO: ("ha sido CANCELADO", N.TRABAJO_CANCELADO),
        }
        accion, tipo = cierre[trabajo.estado]
        mensaje = f"{base}{accion} por {usuario.nombre}."
        if trabajo.estado == T.CANCELADO:
            mensaje += f" Motivo: {trabajo.motivo_cancelacion}."
        notificar(
            [creador], mensaje, tipo, creada_por=usuario, entidad_id=orden.pk, entidad_url=url
        )

    # 2) A los técnicos de la OT (excepto quien hace el cambio).
    tecnicos = User.objects.filter(unidades_asignadas_ot__orden=orden).distinct()
    ref = f"El trabajo {trabajo.codigo} (OT: {orden.display_id})"
    mensaje = tipo = None
    if cambio_estado and trabajo.estado == T.CANCELADO:
        mensaje = f"{ref} fue CANCELADO por {usuario.nombre}. Motivo: {trabajo.motivo_cancelacion}"
        tipo = N.TRABAJO_CANCELADO
    elif (
        cambio_estado
        and {original.estado, trabajo.estado} == {T.COMPLETADO, T.NO_COMPLETADO}
        and original.completado_por_id not in (None, usuario.pk)
    ):
        extra = " Revisa las observaciones." if trabajo.observacion_ingeniero else ""
        mensaje = f"{ref} fue cambiado a '{trabajo.estado}' por {usuario.nombre}.{extra}"
        tipo = N.TRABAJO_REVISADO
    elif (
        cambio_estado
        and original.estado == T.PENDIENTE
        and trabajo.estado in (T.COMPLETADO, T.NO_COMPLETADO)
    ):
        mensaje = f"{ref} fue marcado como '{trabajo.estado}' por {usuario.nombre}."
        tipo = N.TRABAJO_COMPLETADO if trabajo.estado == T.COMPLETADO else N.TRABAJO_NO_COMPLETADO
    elif (
        hubo_observacion
        and trabajo.observacion_ingeniero != original.observacion_ingeniero
        and original.estado in (T.COMPLETADO, T.NO_COMPLETADO)
    ):
        mensaje = (
            f"{usuario.nombre} actualizó observaciones para {ref.lower()}. "
            f"Estado actual: {trabajo.estado}."
        )
        tipo = N.TRABAJO_REVISADO
    if mensaje:
        notificar(tecnicos, mensaje, tipo, creada_por=usuario, entidad_id=orden.pk, entidad_url=url)


@transaction.atomic
def agregar_fotos(trabajo: Trabajo, archivos: list, usuario) -> list[TrabajoFoto]:
    trabajo = Trabajo.objects.select_for_update().get(pk=trabajo.pk)
    if trabajo.fotos.count() + len(archivos) > MAX_FOTOS_POR_TRABAJO:
        raise ValidationError(f"Máximo {MAX_FOTOS_POR_TRABAJO} fotos por trabajo.")
    fotos = []
    for archivo in archivos:
        foto = TrabajoFoto(trabajo=trabajo, imagen=archivo, subida_por=usuario)
        foto.full_clean()
        foto.save()
        fotos.append(foto)
    return fotos


# --- Planes de mantenimiento --------------------------------------------------------


@transaction.atomic
def crear_plan(datos: dict, usuario) -> PlanMantenimiento:
    calendario = datos.pop("calendario", [])
    plan = PlanMantenimiento(creado_por=usuario, **datos)
    plan.full_clean()
    plan.save()
    equipos = Equipo.objects.in_bulk([c["equipo"] for c in calendario], field_name="codigo")
    faltantes = {c["equipo"] for c in calendario} - set(equipos)
    if faltantes:
        raise ValidationError(f"Equipos inexistentes: {sorted(faltantes)}")
    MantenimientoProgramado.objects.bulk_create(
        MantenimientoProgramado(
            plan=plan,
            equipo=equipos[c["equipo"]],
            fecha_programada=c["fecha_programada"],
            motivo_prioridad=c.get("motivo_prioridad", ""),
        )
        for c in calendario
    )
    if not plan.estadisticas:
        plan.estadisticas = {"totalMantenimientosProgramados": len(calendario)}
        plan.save(update_fields=["estadisticas"])
    return plan


@transaction.atomic
def generar_solicitudes_plan(
    plan: PlanMantenimiento,
    usuario,
    items: list[int] | None,
    nombre_tipo_trabajo: str,
    urgencia: str,
) -> tuple[int, list[str]]:
    """Crea una solicitud por cada mantenimiento programado aún sin solicitud."""
    qs = (
        plan.calendario.select_for_update()
        .select_related("equipo")
        .filter(estado=MantenimientoProgramado.Estado.PROGRAMADO)
    )
    if items is not None:
        qs = qs.filter(pk__in=items)
    creadas, errores = 0, []
    for item in qs:
        tipo = TipoTrabajo.objects.filter(
            tipo_equipo_id=item.equipo.tipo_id, nombre__iexact=nombre_tipo_trabajo
        ).first()
        if not tipo:
            errores.append(
                f"{item.equipo.codigo}: su tipo de equipo no tiene el trabajo "
                f"'{nombre_tipo_trabajo}'."
            )
            continue
        solicitud = crear_solicitud(
            {
                "equipo": item.equipo.codigo,
                "tipo_trabajo_id": tipo.pk,
                "urgencia": urgencia,
                "fecha_programada": item.fecha_programada,
                "descripcion": (
                    f"Mantenimiento preventivo programado desde el plan '{plan.nombre}'. "
                    f"Motivo: {item.motivo_prioridad}"
                ),
            },
            usuario,
        )
        item.solicitud = solicitud
        item.estado = MantenimientoProgramado.Estado.SOLICITUD_CREADA
        item.save(update_fields=["solicitud", "estado"])
        creadas += 1
    return creadas, errores


def _obtener(modelo, **filtro):
    try:
        return modelo.objects.get(**filtro)
    except modelo.DoesNotExist:
        campo, valor = next(iter(filtro.items()))
        raise ValidationError(
            f"{modelo._meta.verbose_name.capitalize()} no encontrado ({campo}={valor})."
        ) from None
