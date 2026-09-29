"""Migración completa desde la exportación de Firestore (importar_datos)."""

import json
from datetime import date, time

import httpx
import pytest
from django.core.management import call_command

from apps.accounts.models import User
from apps.assets.models import Equipo, Vehiculo
from apps.catalogs.models import Configuracion, Marca, TipoTrabajo, Urgencia
from apps.core.importador_firestore import Importador, Informe, descargar_fotos
from apps.notifications.models import Notificacion
from apps.operations.models import (
    OrdenDeTrabajo,
    PlanMantenimiento,
    Solicitud,
    Trabajo,
    TrabajoFoto,
    UnidadDeCampo,
)

pytestmark = pytest.mark.django_db

FOTO = "https://firebasestorage.googleapis.com/v0/b/app/o/work_order_photos%2Fot1%2Ft1%2F1-foto.jpg?alt=media&token=abc"

EXPORTACION = {
    "auth_users": [
        {"uid": "u-admin", "email": "admin@example.com", "disabled": False},
        {"uid": "u-tec", "email": "tec@example.com", "disabled": False},
    ],
    "users": [
        {
            "id": "u-admin",
            "nombre": "Admin",
            "email": "admin@example.com",
            "perfiles": ["administrador"],
        },
        {
            "id": "u-tec",
            "nombre": "Técnico",
            "email": "tec@example.com",
            "perfiles": ["tecnicoDeCampo"],
        },
    ],
    "appConfiguration": [
        {
            "id": "mainSettings",
            "empresaNombre": "CNEL",
            "sedeCentralLatitud": -2.17,
            "sedeCentralLongitud": -79.92,
            "operatingHoursStart": "08:00",
            "operatingHoursEnd": "17:00",
            "planningTimeMinutes": 30,
            "lunchTimeMinutes": 45,
            "marcasEquipos": [
                {"value": "Honeywell", "label": "Honeywell"},
                {"value": "Landis", "label": "Landis+Gyr"},
            ],
            "zonasEquipos": [{"value": "Vía a la Costa", "label": "Vía a la Costa"}],
            "tiposEquipos": [
                {
                    "value": "Colector",
                    "label": "Colector",
                    "tiposDeTrabajoAsociados": [
                        {
                            "id": "tt-antena",
                            "nombre": "Revisión de antena",
                            "tiempoEstimadoMinutos": 45,
                        }
                    ],
                }
            ],
            "urgenciasSolicitudes": [
                {"value": "Urgente", "label": "Urgente"},
                {"value": "Normal", "label": "Normal"},
            ],
            "localidades": [
                {"nombre": "Playas", "coordenadas": {"latitude": -2.63, "longitude": -80.39}}
            ],
        }
    ],
    "vehiculos": [
        {
            "id": "V1",
            "placa": "gpa-0001",
            "tipo": "camionCanasta",
            "estado": "disponible",
            "custodioId": "u-tec",
        }
    ],
    "equipos": [
        {
            "id": "COL-001",
            "tipo": "Colector",
            "marca": "Landis",
            "zona": "Vía a la Costa",
            "estado": "Activo",
            "direccion": "Km 12",
            "ip": "10.0.0.5",
            "tipoComunicacion": "Fibra óptica",
            "coordenadas": {"latitude": -2.19, "longitude": -80.01},
            "fechaUltimaRevision": "2025-06-10T15:00:00.000Z",
            "revisionCount": 4,
            "requiereCanasta": True,
            "estadoHistorial": [
                {
                    "estado": "Activo",
                    "fecha": "2024-01-01T12:00:00.000Z",
                    "modificadoPor": "u-admin",
                }
            ],
        },
        {
            "id": "COL-002",
            "tipo": "Colector",
            "marca": "Honeywell",
            "zona": "Vía a la Costa",
            "direccion": "Sin GPS",
            "ip": "no-es-ip",
            "tipoComunicacion": "Celular",
            "coordenadas": None,
        },
    ],
    "fieldUnitCompositions": [{"id": "V1", "vehiculoId": "V1", "tecnicos": ["u-tec"]}],
    "solicitudes": [
        {
            "id": "s1",
            "displayId": "SOL-20250610-AB12C",
            "equipoId": "COL-001",
            "fechaSolicitud": "2025-06-09T20:00:00.000Z",
            # Medianoche de Guayaquil en UTC: debe quedar el 10, no el 9.
            "fechaProgramada": "2025-06-10T05:00:00.000Z",
            "tipoTrabajo": "tt-antena",
            "tiempoServicioEstimado": 45,
            "urgencia": "Urgente",
            "creadoPor": "u-admin",
            "estado": "completada",
        },
        {
            "id": "s2",
            "equipoId": "COL-002",
            "fechaSolicitud": "2025-06-09T20:00:00.000Z",
            "fechaProgramada": "2025-06-11T05:00:00.000Z",
            "tipoTrabajo": "Cambio de batería",  # dato antiguo: nombre, no ID
            "urgencia": "Normal",
            "creadoPor": "u-borrado",
            "estado": "pendiente",
        },
        {"id": "s3", "equipoId": "NO-EXISTE", "tipoTrabajo": "tt-antena", "creadoPor": "u-admin"},
    ],
    "ordenesDeTrabajo": [
        {
            "id": "ot1",
            "displayId": "OT-20250610-1-QWER",
            "fechaCreacion": "2025-06-10T13:00:00.000Z",
            "creadoPor": "u-admin",
            "estadoGeneral": "CompletadaTotal",
            "unidadesAsignadas": [{"rutaId": "R1", "vehiculoId": "V1", "tecnicos": ["u-tec"]}],
            "trabajos": [
                {
                    "id": "OT-20250610-1-QWER-T1",
                    "equipoId": "COL-001",
                    "solicitudId": "s1",
                    "tipoTrabajo": "tt-antena",
                    "estado": "Completado",
                    "detalles": "Se ajustó la antena",
                    "fotos": [FOTO],
                    "completadoPor": "u-tec",
                    "fechaFinalizacion": "2025-06-10T18:00:00.000Z",
                },
                {"id": "OT-20250610-1-QWER-T2", "equipoId": "COL-001", "solicitudId": "s-perdida"},
            ],
        }
    ],
    "planesDeMantenimiento": [
        {
            "id": "p1",
            "nombre": "Plan 2025",
            "fechaCreacion": "2025-01-01T12:00:00.000Z",
            "creadoPor": "u-admin",
            "tiempoDeEjecucionDias": 90,
            "exclusiones": [{"campo": "zona", "operador": "es", "valor": "Norte"}],
            "estado": "activo",
            "calendario": [
                {
                    "equipoId": "COL-001",
                    "fechaProgramada": "2025-06-10T05:00:00.000Z",
                    "solicitudId": "s1",
                    "estado": "solicitud_creada",
                    "motivoPrioridad": "Más de 90 días sin revisión",
                }
            ],
        }
    ],
    "notificaciones": [
        {
            "id": "n1",
            "userId": "u-tec",
            "mensaje": "Nueva OT",
            "tipo": "nueva_ot",
            "leida": False,
            "fechaCreacion": "2025-06-10T13:00:00.000Z",
            "creadaPor": "u-admin",
        },
        {"id": "n2", "userId": "u-borrado", "mensaje": "x"},
    ],
}


@pytest.fixture
def exportacion(tmp_path, monkeypatch):
    for nombre, docs in EXPORTACION.items():
        (tmp_path / f"{nombre}.json").write_text(json.dumps(docs), encoding="utf-8")
    monkeypatch.setenv("ADMIN_TEMP_PASSWORD", "Temporal-de-prueba-2026")
    return tmp_path


def importar(carpeta, *extra):
    call_command(
        "importar_datos",
        "--dir",
        str(carpeta),
        "--admin-email",
        "admin@example.com",
        "--sin-fotos",
        *extra,
    )


def test_importa_todo_conservando_identificadores(exportacion):
    importar(exportacion)

    c = Configuracion.get_solo()
    assert c.empresa_nombre == "CNEL"
    assert c.hora_inicio_jornada == time(8, 0) and c.minutos_almuerzo == 45
    assert c.sede_central_ubicacion.y == pytest.approx(-2.17)

    # Catálogos: se reutilizan los existentes aunque cambie mayúscula o tilde.
    assert Urgencia.objects.filter(valor="urgente").count() == 1
    assert not Urgencia.objects.filter(valor="Urgente").exists()
    assert Marca.objects.get(etiqueta="Landis+Gyr").valor == "landis"

    e1 = Equipo.objects.get(codigo="COL-001")
    assert (e1.tipo.valor, e1.zona.valor, e1.estado.valor) == (
        "colector",
        "via-a-la-costa",
        "activo",
    )
    assert e1.revision_count == 4 and e1.requiere_canasta and e1.ip == "10.0.0.5"
    assert e1.estado_historial.count() == 1
    e2 = Equipo.objects.get(codigo="COL-002")
    assert e2.campos_adicionales == {"ubicacion_pendiente": True, "ip_original": "no-es-ip"}
    assert e2.ip is None and e2.estado.valor == "activo"

    v = Vehiculo.objects.get(codigo="V1")
    assert v.placa == "GPA-0001" and v.custodio.email == "tec@example.com"
    assert list(UnidadDeCampo.objects.get(vehiculo=v).tecnicos.values_list("email", flat=True)) == [
        "tec@example.com"
    ]

    s1 = Solicitud.objects.get(firestore_id="s1")
    assert s1.display_id == "SOL-20250610-AB12C"
    assert s1.fecha_programada == date(2025, 6, 10)
    assert s1.tipo_trabajo.nombre == "Revisión de antena"
    assert s1.urgencia.valor == "urgente" and s1.estado == "completada"
    s2 = Solicitud.objects.get(firestore_id="s2")
    assert s2.display_id.startswith("SOL-")  # no tenía displayId: se genera
    assert s2.tipo_trabajo.nombre == "Cambio de batería"
    assert s2.creado_por.email == "desconocido@migracion.invalid"
    assert not Solicitud.objects.filter(firestore_id="s3").exists()

    ot = OrdenDeTrabajo.objects.get(firestore_id="ot1")
    assert ot.display_id == "OT-20250610-1-QWER" and ot.estado_general == "CompletadaTotal"
    ua = ot.unidades_asignadas.get()
    assert ua.ruta_id == "R1" and ua.vehiculo == v
    t = ot.trabajos.get()  # el T2 apunta a una solicitud perdida: se omite
    assert t.codigo == "OT-20250610-1-QWER-T1" and t.secuencia == 1
    assert t.estado == "Completado" and t.completado_por.email == "tec@example.com"
    assert t.tiempo_servicio_estimado == 45
    assert list(ot.tecnicos_asignados().values_list("email", flat=True)) == ["tec@example.com"]

    plan = PlanMantenimiento.objects.get(firestore_id="p1")
    m = plan.calendario.get()
    assert (m.equipo, m.solicitud, m.estado) == (e1, s1, "solicitud_creada")

    n = Notificacion.objects.get(firestore_id="n1")
    assert n.usuario.email == "tec@example.com" and n.creada_por.email == "admin@example.com"
    assert Notificacion.objects.count() == 1


def test_es_idempotente(exportacion):
    importar(exportacion)
    antes = [m.objects.count() for m in (Equipo, Solicitud, OrdenDeTrabajo, Trabajo, Notificacion)]
    importar(exportacion)
    despues = [
        m.objects.count() for m in (Equipo, Solicitud, OrdenDeTrabajo, Trabajo, Notificacion)
    ]
    assert antes == despues
    assert TipoTrabajo.objects.filter(nombre="Cambio de batería").count() == 1


def test_simular_no_guarda_nada(exportacion):
    importar(exportacion, "--simular")
    assert not Equipo.objects.exists()
    assert not User.objects.filter(email="admin@example.com").exists()


def test_descarga_fotos(exportacion, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    importar(exportacion)
    t = Trabajo.objects.get()
    pedidas = []

    def responder(request):
        pedidas.append(str(request.url))
        return httpx.Response(200, content=b"\xff\xd8jpeg")

    informe = Informe()
    cliente = httpx.Client(transport=httpx.MockTransport(responder))
    descargar_fotos([("trabajo", t.pk, FOTO)], informe, cliente)
    foto = TrabajoFoto.objects.get(trabajo=t)
    assert pedidas == [FOTO]
    assert foto.imagen.name.endswith(".jpg")
    assert informe.creados["fotos"] == 1


def test_fotos_pendientes_se_recogen(exportacion):
    importar(exportacion)  # crea usuarios y datos
    Trabajo.objects.all().delete()
    OrdenDeTrabajo.objects.all().delete()
    informe = Importador(exportacion).importar_todo()
    assert [(tipo, url) for tipo, _, url in informe.fotos_pendientes] == [("trabajo", FOTO)]
