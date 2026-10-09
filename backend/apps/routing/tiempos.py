"""Tiempos y geometrías de viaje entre puntos.

Usa OSRM (autoalojado, datos de OpenStreetMap) si `OSRM_URL` está configurado y
responde; si no, estima con la distancia en línea recta, un factor de desvío
urbano y una velocidad media. La respuesta indica siempre la fuente usada.
"""

import logging
import math
from dataclasses import dataclass

import httpx
from django.conf import settings

log = logging.getLogger(__name__)

Punto = tuple[float, float]  # (lat, lng)

# Estimación de respaldo: los primeros km a velocidad urbana de Guayaquil y el
# resto a velocidad de carretera (p. ej., Vía a la Costa hacia Playas).
FACTOR_DESVIO = 1.35
KM_URBANOS = 10.0
VELOCIDAD_URBANA_KMH = 25.0
VELOCIDAD_CARRETERA_KMH = 65.0
TIMEOUT_S = 10.0


@dataclass
class Matriz:
    minutos: list[list[int]]
    fuente: str  # "osrm" | "estimado"


def distancia_km(a: Punto, b: Punto) -> float:
    """Distancia del círculo máximo (haversine)."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def minutos_estimados(a: Punto, b: Punto) -> int:
    km = distancia_km(a, b) * FACTOR_DESVIO
    urbano = min(km, KM_URBANOS)
    horas = urbano / VELOCIDAD_URBANA_KMH + (km - urbano) / VELOCIDAD_CARRETERA_KMH
    return round(horas * 60)


def _estimar(puntos: list[Punto]) -> Matriz:
    return Matriz(
        minutos=[[minutos_estimados(a, b) for b in puntos] for a in puntos], fuente="estimado"
    )


def _coords(puntos: list[Punto]) -> str:
    return ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in puntos)


def matriz_tiempos(puntos: list[Punto]) -> Matriz:
    url = getattr(settings, "OSRM_URL", "")
    if url and len(puntos) > 1:
        try:
            r = httpx.get(
                f"{url}/table/v1/driving/{_coords(puntos)}",
                params={"annotations": "duration"},
                timeout=TIMEOUT_S,
            )
            r.raise_for_status()
            datos = r.json()
            if datos.get("code") == "Ok":
                return Matriz(
                    minutos=[[round((s or 0) / 60) for s in fila] for fila in datos["durations"]],
                    fuente="osrm",
                )
        except (httpx.HTTPError, ValueError, KeyError) as e:
            log.warning("OSRM no disponible (%s); se usan tiempos estimados.", e)
    return _estimar(puntos)


def geometria_ruta(puntos: list[Punto]) -> tuple[list[list[float]], bool]:
    """Trazado como [[lng, lat], ...] y si va por calles (OSRM) o en línea recta."""
    url = getattr(settings, "OSRM_URL", "")
    if url and len(puntos) > 1:
        try:
            r = httpx.get(
                f"{url}/route/v1/driving/{_coords(puntos)}",
                params={"overview": "full", "geometries": "geojson"},
                timeout=TIMEOUT_S,
            )
            r.raise_for_status()
            datos = r.json()
            if datos.get("code") == "Ok":
                return datos["routes"][0]["geometry"]["coordinates"], True
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as e:
            log.warning("OSRM no disponible para trazar la ruta (%s).", e)
    return [[lng, lat] for lat, lng in puntos], False
