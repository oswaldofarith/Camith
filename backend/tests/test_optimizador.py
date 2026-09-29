"""Tests del optimizador de rutas (sin OSRM: tiempos estimados)."""

import pytest

from apps.routing.optimizador import Parada, Ruta, optimizar
from apps.routing.tiempos import distancia_km, matriz_tiempos

SEDE = (-2.1709, -79.9223)  # Guayaquil
PLAYAS = (-2.6286, -80.3897)  # General Villamil Playas


def parada(i, lat_off=0.0, lng_off=0.0, **extra):
    return Parada(id=i, punto=(SEDE[0] + lat_off, SEDE[1] + lng_off), servicio_min=30, **extra)


@pytest.fixture(autouse=True)
def sin_osrm(settings):
    settings.OSRM_URL = ""


def ids(ruta):
    return [v.parada.id for v in ruta.visitas]


def test_estimacion_de_tiempos():
    assert 70 < distancia_km(SEDE, PLAYAS) < 80
    m = matriz_tiempos([SEDE, PLAYAS])
    assert m.fuente == "estimado"
    assert m.minutos[0][0] == 0
    assert 190 < m.minutos[0][1] < 240  # ~75 km con desvío a 28 km/h


def test_asigna_todo_y_equilibra():
    paradas = [parada(i, lat_off=0.01 * i) for i in range(1, 7)]
    r = optimizar(SEDE, [Ruta("A"), Ruta("B")], paradas, jornada_min=480, tiempo_limite_s=2)
    assert not r.no_asignadas
    assert sorted(len(x.visitas) for x in r.rutas) == [3, 3]  # 6 trabajos repartidos
    assert r.fuente_tiempos == "estimado"
    for ruta in r.rutas:
        llegadas = [v.llegada_min for v in ruta.visitas]
        assert llegadas == sorted(llegadas)


def test_urgente_va_primero_y_uno_por_ruta():
    paradas = [
        parada(1, lat_off=0.001),
        parada(2, lat_off=0.05, urgente=True),  # lejos, pero debe ir primero
        parada(3, lat_off=0.002),
    ]
    r = optimizar(SEDE, [Ruta("A")], paradas, jornada_min=480, tiempo_limite_s=2)
    assert ids(r.rutas[0])[0] == 2

    dos_urgentes = [parada(1, urgente=True), parada(2, lat_off=0.01, urgente=True)]
    r = optimizar(SEDE, [Ruta("A")], dos_urgentes, jornada_min=480, tiempo_limite_s=2)
    assert len(r.no_asignadas) == 1
    assert "más trabajos urgentes que rutas" in r.no_asignadas[0][1]


def test_canasta_solo_en_ruta_con_camion_canasta():
    paradas = [parada(1, requiere_canasta=True), parada(2, lat_off=0.01)]
    r = optimizar(SEDE, [Ruta("sin"), Ruta("con", tiene_canasta=True)], paradas, 480, 2)
    ruta_con = next(x for x in r.rutas if x.id == "con")
    assert 1 in ids(ruta_con)

    r = optimizar(SEDE, [Ruta("sin")], paradas, 480, 2)
    assert [p.id for p, _ in r.no_asignadas] == [1]
    assert "canasta" in r.no_asignadas[0][1]


def test_respeta_la_jornada():
    # 5 trabajos de 30 min no caben en 2 horas con viajes: sobran algunos.
    paradas = [parada(i, lat_off=0.02 * i) for i in range(1, 6)]
    r = optimizar(SEDE, [Ruta("A")], paradas, jornada_min=120, tiempo_limite_s=2)
    assert r.no_asignadas
    assert all("jornada" in motivo for _, motivo in r.no_asignadas)
    assert r.rutas[0].minutos_total <= 120


def test_parada_fija_en_su_ruta():
    paradas = [parada(1, ruta_fija="B"), parada(2, lat_off=0.01)]
    r = optimizar(SEDE, [Ruta("A"), Ruta("B")], paradas, 480, 2)
    assert 1 in ids(next(x for x in r.rutas if x.id == "B"))


def test_osrm_caido_usa_estimacion(settings):
    settings.OSRM_URL = "http://127.0.0.1:9"  # puerto cerrado
    m = matriz_tiempos([SEDE, PLAYAS])
    assert m.fuente == "estimado"
