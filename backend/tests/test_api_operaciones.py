import io

import pytest
from PIL import Image

from apps.accounts.roles import Rol
from apps.catalogs.models import TipoTrabajo
from apps.notifications.models import Notificacion
from apps.operations.models import OrdenDeTrabajo, Solicitud, Trabajo

pytestmark = pytest.mark.django_db
JSON = "application/json"


@pytest.fixture
def actores(como):
    """Clientes autenticados de cada rol."""
    return {
        "admin": como(Rol.ADMINISTRADOR),
        "supervisor": como(Rol.SUPERVISOR),
        "ingeniero": como(Rol.INGENIERO_DE_OFICINA),
        "tecnico": como(Rol.TECNICO_DE_CAMPO),
        "otro_tecnico": como(Rol.TECNICO_DE_CAMPO, email="otro@example.com"),
    }


def crear_solicitud_api(cliente, equipo, tipo_trabajo, **extra):
    datos = {
        "equipo": equipo.codigo,
        "tipo_trabajo_id": tipo_trabajo.pk,
        "urgencia": "normal",
        "fecha_programada": "2026-10-01",
        **extra,
    }
    return cliente.post("/api/solicitudes", datos, content_type=JSON)


@pytest.fixture
def orden(actores, equipo, tipo_trabajo, vehiculo):
    """OT con dos trabajos, creada por el supervisor a partir de solicitudes del ingeniero."""
    ids = [
        crear_solicitud_api(actores["ingeniero"], equipo, tipo_trabajo).json()["id"]
        for _ in range(2)
    ]
    resp = actores["supervisor"].post(
        "/api/ordenes",
        [
            {
                "unidades": [
                    {
                        "ruta_id": "R1",
                        "vehiculo": vehiculo.codigo,
                        "tecnicos": [actores["tecnico"].user.pk],
                    }
                ],
                "solicitudes": ids,
            }
        ],
        content_type=JSON,
    )
    assert resp.status_code == 201, resp.content
    return resp.json()[0]


def notificaciones(usuario, tipo):
    return Notificacion.objects.filter(usuario=usuario, tipo=tipo)


# --- Solicitudes ----------------------------------------------------------------------


def test_crear_solicitud_notifica_supervisores(actores, equipo, tipo_trabajo):
    resp = crear_solicitud_api(actores["ingeniero"], equipo, tipo_trabajo)
    assert resp.status_code == 201, resp.content
    datos = resp.json()
    assert datos["display_id"].startswith("SOL-")
    assert datos["tiempo_servicio_estimado"] == 45  # heredado del tipo de trabajo
    assert datos["creado_por_nombre"] == "Usuario Prueba"
    assert notificaciones(actores["supervisor"].user, "nueva_solicitud").count() == 1


def test_validaciones_de_solicitud(actores, equipo, tipo_trabajo):
    assert crear_solicitud_api(actores["tecnico"], equipo, tipo_trabajo).status_code == 403
    otro_tipo = TipoTrabajo.objects.create(
        tipo_equipo=tipo_trabajo.tipo_equipo.__class__.objects.get(valor="medidor"),
        nombre="Lectura",
    )
    resp = crear_solicitud_api(actores["ingeniero"], equipo, otro_tipo)
    assert resp.status_code == 400
    assert "tipo de equipo" in resp.json()["detail"]


def test_filtrar_y_editar_solicitud(actores, equipo, tipo_trabajo):
    sid = crear_solicitud_api(actores["ingeniero"], equipo, tipo_trabajo).json()["id"]
    lista = actores["tecnico"].get("/api/solicitudes?estado=pendiente").json()
    assert lista["count"] == 1
    resp = actores["ingeniero"].patch(
        f"/api/solicitudes/{sid}", {"urgencia": "urgente"}, content_type=JSON
    )
    assert resp.json()["urgencia"] == "urgente"


def test_cancelar_solicitud_pendiente(actores, equipo, tipo_trabajo):
    sid = crear_solicitud_api(actores["supervisor"], equipo, tipo_trabajo).json()["id"]
    resp = actores["ingeniero"].post(
        f"/api/solicitudes/{sid}/cancelar", {"motivo": "Duplicada"}, content_type=JSON
    )
    assert resp.json()["estado"] == "cancelada"
    assert notificaciones(actores["supervisor"].user, "solicitud_cancelada").count() == 1


# --- Órdenes de trabajo -----------------------------------------------------------------


def test_crear_orden(actores, orden):
    assert orden["display_id"].startswith("OT-")
    assert orden["estado_general"] == "Pendiente"
    assert [t["codigo"] for t in orden["trabajos"]] == [
        f"{orden['display_id']}-T1",
        f"{orden['display_id']}-T2",
    ]
    assert orden["unidades"][0]["tecnicos"][0]["id"] == actores["tecnico"].user.pk
    assert set(Solicitud.objects.values_list("estado", flat=True)) == {"asignada"}
    assert notificaciones(actores["tecnico"].user, "nueva_ot").count() == 1
    assert notificaciones(actores["ingeniero"].user, "solicitud_asignada").count() == 2


def test_crear_orden_es_atomica(actores, orden, vehiculo):
    # Las solicitudes ya están asignadas: la segunda OT falla y no deja nada a medias.
    ids = [t["solicitud_id"] for t in orden["trabajos"]]
    resp = actores["supervisor"].post(
        "/api/ordenes",
        [
            {
                "unidades": [
                    {"vehiculo": vehiculo.codigo, "tecnicos": [actores["tecnico"].user.pk]}
                ],
                "solicitudes": ids,
            }
        ],
        content_type=JSON,
    )
    assert resp.status_code == 400
    assert OrdenDeTrabajo.objects.count() == 1


def test_solo_supervisor_crea_ordenes(actores, vehiculo):
    datos = [{"unidades": [{"vehiculo": vehiculo.codigo, "tecnicos": [1]}], "solicitudes": [1]}]
    resp = actores["ingeniero"].post("/api/ordenes", datos, content_type=JSON)
    assert resp.status_code == 403


def test_listar_ordenes_por_tecnico(actores, orden):
    tecnico = actores["tecnico"].user.pk
    lista = actores["supervisor"].get(f"/api/ordenes?tecnico={tecnico}").json()
    assert lista["count"] == 1
    assert lista["items"][0]["trabajos_por_estado"] == {"Pendiente": 2}
    otro = actores["otro_tecnico"].user.pk
    assert actores["supervisor"].get(f"/api/ordenes?tecnico={otro}").json()["count"] == 0


# --- Trabajos -------------------------------------------------------------------------


def test_tecnico_reporta_trabajo(actores, orden, equipo):
    trabajo = orden["trabajos"][0]
    resp = actores["tecnico"].post(
        f"/api/trabajos/{trabajo['id']}/reportar",
        {"estado": "Completado", "detalles": "Se cambió la antena", "hallazgos": "Óxido"},
        content_type=JSON,
    )
    assert resp.status_code == 200, resp.content
    datos = resp.json()
    assert datos["completado_por_id"] == actores["tecnico"].user.pk
    assert datos["fecha_finalizacion"] is not None
    assert Solicitud.objects.get(pk=trabajo["solicitud_id"]).estado == "completada"
    assert OrdenDeTrabajo.objects.get(pk=orden["id"]).estado_general == "En Progreso"
    equipo.refresh_from_db()
    assert equipo.revision_count == 1 and equipo.fecha_ultima_revision is not None
    assert notificaciones(actores["ingeniero"].user, "trabajo_completado").count() == 1


def test_tecnico_no_asignado_no_reporta(actores, orden):
    trabajo = orden["trabajos"][0]
    resp = actores["otro_tecnico"].post(
        f"/api/trabajos/{trabajo['id']}/reportar", {"estado": "Completado"}, content_type=JSON
    )
    assert resp.status_code == 403


def test_tecnico_no_reporta_trabajo_cancelado(actores, orden):
    trabajo = orden["trabajos"][0]
    actores["supervisor"].post(
        f"/api/trabajos/{trabajo['id']}/cancelar", {"motivo": "Lluvia"}, content_type=JSON
    )
    resp = actores["tecnico"].post(
        f"/api/trabajos/{trabajo['id']}/reportar", {"estado": "Completado"}, content_type=JSON
    )
    assert resp.status_code == 403


def test_revision_del_ingeniero(actores, orden, equipo):
    trabajo = orden["trabajos"][0]
    url = f"/api/trabajos/{trabajo['id']}"
    actores["tecnico"].post(f"{url}/reportar", {"estado": "Completado"}, content_type=JSON)

    resp = actores["ingeniero"].post(
        f"{url}/revisar",
        {"estado": "No Completado", "observacion": "Falta la foto del sello"},
        content_type=JSON,
    )
    datos = resp.json()
    assert datos["estado"] == "No Completado"
    assert datos["completado_por_id"] == actores["tecnico"].user.pk  # se conserva
    assert datos["observacion_ingeniero_por_id"] == actores["ingeniero"].user.pk
    assert notificaciones(actores["tecnico"].user, "trabajo_revisado").count() == 1
    equipo.refresh_from_db()
    assert equipo.revision_count == 0

    resp = actores["ingeniero"].post(f"{url}/revisar", {"estado": "Pendiente"}, content_type=JSON)
    datos = resp.json()
    assert (datos["completado_por_id"], datos["observacion_ingeniero"]) == (None, "")
    assert Solicitud.objects.get(pk=trabajo["solicitud_id"]).estado == "asignada"


def test_tecnico_no_puede_revisar(actores, orden):
    trabajo = orden["trabajos"][0]
    resp = actores["tecnico"].post(
        f"/api/trabajos/{trabajo['id']}/revisar", {"observacion": "x"}, content_type=JSON
    )
    assert resp.status_code == 403


def test_cancelar_trabajo(actores, orden):
    trabajo = orden["trabajos"][0]
    url = f"/api/trabajos/{trabajo['id']}/cancelar"
    assert actores["ingeniero"].post(url, {"motivo": "x"}, content_type=JSON).status_code == 403
    resp = actores["supervisor"].post(url, {"motivo": "Acceso bloqueado"}, content_type=JSON)
    assert resp.json()["estado"] == "Cancelado"
    solicitud = Solicitud.objects.get(pk=trabajo["solicitud_id"])
    assert (solicitud.estado, solicitud.motivo_cancelacion) == ("cancelada", "Acceso bloqueado")
    assert notificaciones(actores["tecnico"].user, "trabajo_cancelado").count() == 1


def test_cancelar_solicitud_asignada(actores, orden):
    sid = orden["trabajos"][1]["solicitud_id"]
    url = f"/api/solicitudes/{sid}/cancelar"
    assert actores["ingeniero"].post(url, {"motivo": "x"}, content_type=JSON).status_code == 403
    assert (
        actores["supervisor"]
        .post(url, {"motivo": "Ya no aplica"}, content_type=JSON)
        .json()["estado"]
        == "cancelada"
    )
    assert Trabajo.objects.get(solicitud_id=sid).estado == "Cancelado"


def test_orden_completa(actores, orden):
    for trabajo in orden["trabajos"]:
        actores["tecnico"].post(
            f"/api/trabajos/{trabajo['id']}/reportar", {"estado": "Completado"}, content_type=JSON
        )
    assert OrdenDeTrabajo.objects.get(pk=orden["id"]).estado_general == "CompletadaTotal"


def test_mis_trabajos(actores, orden):
    assert len(actores["tecnico"].get("/api/trabajos/mios").json()) == 2
    assert actores["otro_tecnico"].get("/api/trabajos/mios").json() == []


def test_borrar_orden(actores, orden):
    trabajo = orden["trabajos"][0]
    actores["tecnico"].post(
        f"/api/trabajos/{trabajo['id']}/reportar", {"estado": "Completado"}, content_type=JSON
    )
    assert actores["supervisor"].delete(f"/api/ordenes/{orden['id']}").status_code == 400
    actores["ingeniero"].post(
        f"/api/trabajos/{trabajo['id']}/revisar", {"estado": "Pendiente"}, content_type=JSON
    )
    assert actores["supervisor"].delete(f"/api/ordenes/{orden['id']}").status_code == 204
    assert set(Solicitud.objects.values_list("estado", flat=True)) == {"pendiente"}


def imagen(nombre="foto.jpg"):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "blue").save(buffer, "JPEG")
    buffer.name = nombre
    buffer.seek(0)
    return buffer


def test_fotos_de_trabajo(actores, orden, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    url = f"/api/trabajos/{orden['trabajos'][0]['id']}/fotos"
    assert actores["otro_tecnico"].post(url, {"fotos": [imagen()]}).status_code == 403

    resp = actores["tecnico"].post(url, {"fotos": [imagen(), imagen()]})
    assert resp.status_code == 201, resp.content
    assert resp.json()[0]["url"].startswith("/media/trabajos/fotos/")

    resp = actores["tecnico"].post(url, {"fotos": [imagen() for _ in range(4)]})
    assert resp.status_code == 400  # máximo 5 por trabajo

    foto_id = actores["tecnico"].get(url.replace("/fotos", "")).json()["fotos"][0]["id"]
    assert actores["tecnico"].delete(f"{url}/{foto_id}").status_code == 204


def test_kpis(actores, orden):
    trabajo = orden["trabajos"][0]
    actores["tecnico"].post(
        f"/api/trabajos/{trabajo['id']}/reportar", {"estado": "Completado"}, content_type=JSON
    )
    kpis = actores["supervisor"].get("/api/dashboard/kpis").json()
    assert kpis == {
        "ordenes_del_dia": 1,
        "trabajos_pendientes_total": 1,
        "trabajos_completados_hoy": 1,
        "trabajos_pendientes_creados_hoy": 1,
        "trabajos_no_completados_creados_hoy": 0,
        "solicitudes_pendientes": 0,
    }


# --- Unidades de campo y planes de mantenimiento ------------------------------------------


def test_unidades_de_campo(actores, vehiculo):
    datos = [{"vehiculo": vehiculo.codigo, "tecnicos": [actores["tecnico"].user.pk]}]
    assert (
        actores["tecnico"].put("/api/unidades-campo", datos, content_type=JSON).status_code == 403
    )
    resp = actores["supervisor"].put("/api/unidades-campo", datos, content_type=JSON)
    assert resp.json() == datos
    assert actores["tecnico"].get("/api/unidades-campo").json() == datos


def test_plan_de_mantenimiento(actores, equipo, tipo_trabajo):
    TipoTrabajo.objects.create(tipo_equipo=equipo.tipo, nombre="Mantenimiento preventivo")
    supervisor = actores["supervisor"]
    resp = supervisor.post(
        "/api/planes-mantenimiento",
        {
            "nombre": "Plan 2026",
            "tiempo_de_ejecucion_dias": 90,
            "exclusiones": [{"campo": "zona", "operador": "es", "valor": "sur"}],
            "calendario": [
                {
                    "equipo": equipo.codigo,
                    "fecha_programada": "2026-11-01",
                    "motivo_prioridad": "Antiguo",
                }
            ],
        },
        content_type=JSON,
    )
    assert resp.status_code == 201, resp.content
    plan = resp.json()
    assert plan["calendario"][0]["estado"] == "programado"

    resp = supervisor.post(
        f"/api/planes-mantenimiento/{plan['id']}/generar-solicitudes", {}, content_type=JSON
    )
    assert resp.json() == {"creadas": 1, "errores": []}
    detalle = supervisor.get(f"/api/planes-mantenimiento/{plan['id']}").json()
    item = detalle["calendario"][0]
    assert item["estado"] == "solicitud_creada"
    solicitud = Solicitud.objects.get(pk=item["solicitud_id"])
    assert solicitud.tipo_trabajo.nombre == "Mantenimiento preventivo"
    assert "Plan 2026" in solicitud.descripcion


def test_plan_crea_el_tipo_de_trabajo_si_falta(actores, equipo):
    supervisor = actores["supervisor"]
    plan = supervisor.post(
        "/api/planes-mantenimiento",
        {
            "nombre": "P",
            "tiempo_de_ejecucion_dias": 30,
            "calendario": [
                {"equipo": equipo.codigo, "fecha_programada": "2026-11-01"},
                {"equipo": equipo.codigo, "fecha_programada": "2026-12-01"},
            ],
        },
        content_type=JSON,
    ).json()
    resp = supervisor.post(
        f"/api/planes-mantenimiento/{plan['id']}/generar-solicitudes", {}, content_type=JSON
    ).json()
    assert resp == {"creadas": 2, "errores": []}
    # Se creó una sola vez para el tipo de equipo y se reutilizó.
    tipos = TipoTrabajo.objects.filter(tipo_equipo=equipo.tipo, nombre="Mantenimiento preventivo")
    assert tipos.count() == 1
    assert tipos.get().tiempo_estimado_minutos == 60


# --- Notificaciones ---------------------------------------------------------------------


def test_notificaciones(actores, orden):
    tecnico = actores["tecnico"]
    assert tecnico.get("/api/notificaciones/conteo").json() == {"no_leidas": 1}
    lista = tecnico.get("/api/notificaciones").json()
    assert lista["items"][0]["tipo"] == "nueva_ot"
    nid = lista["items"][0]["id"]

    # Nadie puede marcar notificaciones ajenas.
    assert actores["otro_tecnico"].post(f"/api/notificaciones/{nid}/leer").status_code == 404
    assert tecnico.post(f"/api/notificaciones/{nid}/leer").json()["leida"] is True
    assert tecnico.get("/api/notificaciones?no_leidas=true").json()["count"] == 0
    assert actores["ingeniero"].post("/api/notificaciones/leer-todas").json() == {"marcadas": 2}


def test_listados_sin_consultas_n_mas_1(actores, orden, django_assert_max_num_queries):
    supervisor = actores["supervisor"]
    # Número fijo de consultas, independiente de cuántas órdenes o trabajos haya.
    with django_assert_max_num_queries(12):
        supervisor.get(f"/api/ordenes/{orden['id']}")
    with django_assert_max_num_queries(12):
        supervisor.get("/api/ordenes")
    with django_assert_max_num_queries(10):
        actores["tecnico"].get("/api/trabajos/mios")


def test_historial_de_trabajos_por_equipo(actores, orden, equipo):
    datos = actores["ingeniero"].get(f"/api/trabajos?equipo={equipo.codigo}").json()
    assert datos["count"] == 2
    assert datos["items"][0]["equipo"]["codigo"] == equipo.codigo
    assert actores["ingeniero"].get("/api/trabajos?equipo=OTRO").json()["count"] == 0
    assert actores["ingeniero"].get("/api/trabajos?estado=Completado").json()["count"] == 0


def test_tendencias_dashboard(actores, orden):
    trabajo = orden["trabajos"][0]
    actores["tecnico"].post(
        f"/api/trabajos/{trabajo['id']}/reportar", {"estado": "Completado"}, content_type=JSON
    )
    serie = actores["supervisor"].get("/api/dashboard/tendencias?dias=7").json()
    assert len(serie) == 7
    hoy = serie[-1]
    assert (hoy["ordenes"], hoy["pendientes"], hoy["completados"]) == (1, 1, 1)
    assert all(d["ordenes"] == 0 for d in serie[:-1])
