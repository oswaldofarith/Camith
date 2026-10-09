import datetime

import pytest
from django.contrib.auth.models import Group
from django.contrib.gis.geos import Point
from django.core.management import call_command

from apps.accounts.models import User
from apps.accounts.roles import Rol
from apps.assets.models import Equipo
from apps.catalogs.models import EstadoEquipo, Marca, TipoEquipo, TipoTrabajo, Urgencia, Zona


@pytest.fixture(autouse=True)
def cache_limpia():
    """Los límites de intentos de allauth viven en la caché: que no pasen de un test a otro."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def roles(db):
    call_command("sync_roles", verbosity=0)


@pytest.fixture
def crear_usuario(roles):
    def _crear(email="tecnico@example.com", password="clave-segura-123", rol=None, **extra):
        user = User.objects.create_user(
            email=email, password=password, nombre="Usuario Prueba", **extra
        )
        if rol:
            user.groups.add(Group.objects.get(name=rol))
        return user

    return _crear


@pytest.fixture
def supervisor(crear_usuario):
    return crear_usuario(email="supervisor@example.com", rol=Rol.SUPERVISOR)


@pytest.fixture
def equipo(db):
    tipo = TipoEquipo.objects.get(valor="colector")
    return Equipo.objects.create(
        codigo="COL-001",
        tipo=tipo,
        marca=Marca.objects.get(valor="honeywell"),
        zona=Zona.objects.get(valor="norte"),
        estado=EstadoEquipo.objects.get(valor="activo"),
        direccion="Av. Principal 123",
        ubicacion=Point(-79.922356, -2.170998, srid=4326),
        tipo_comunicacion=Equipo.TipoComunicacion.CELULAR,
    )


@pytest.fixture
def tipo_trabajo(equipo):
    return TipoTrabajo.objects.create(
        tipo_equipo=equipo.tipo, nombre="Revisión", tiempo_estimado_minutos=45
    )


@pytest.fixture
def crear_solicitud(equipo, tipo_trabajo, supervisor):
    from apps.operations.models import Solicitud

    def _crear(**extra):
        datos = {
            "equipo": equipo,
            "tipo_trabajo": tipo_trabajo,
            "urgencia": Urgencia.objects.get(valor="normal"),
            "fecha_programada": datetime.date(2026, 10, 1),
            "creado_por": supervisor,
        }
        return Solicitud.objects.create(**{**datos, **extra})

    return _crear


@pytest.fixture
def vehiculo(db):
    from apps.assets.models import Vehiculo
    from apps.catalogs.models import EstadoVehiculo, TipoVehiculo

    return Vehiculo.objects.create(
        codigo="V-01",
        placa="GBA-1234",
        tipo=TipoVehiculo.objects.get(valor="camionCanasta"),
        estado=EstadoVehiculo.objects.get(valor="disponible"),
    )


@pytest.fixture
def como(client, crear_usuario):
    """Devuelve un cliente autenticado con un usuario del rol indicado."""
    from django.test import Client

    usuarios = {}

    def _como(rol, email=None):
        email = email or f"{rol.lower()}@example.com"
        if email not in usuarios:
            usuarios[email] = User.objects.filter(email=email).first() or crear_usuario(
                email=email, rol=rol
            )
        cliente = Client()
        cliente.force_login(usuarios[email])
        cliente.user = usuarios[email]
        return cliente

    return _como
