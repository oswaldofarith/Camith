"""Asignación y orden de visitas (VRP) con Google OR-Tools.

Sustituye a la asignación con IA de la versión anterior. Sus reglas pasan a ser
restricciones exactas del modelo:
- Un trabajo urgente va primero en su ruta (y por tanto nunca dos en la misma).
- Los equipos que requieren canasta solo van en rutas con camión canasta.
- Cada ruta cabe en la jornada: viaje + servicio ≤ minutos disponibles.
- Las solicitudes fijadas a una ruta se respetan.
- La carga se equilibra penalizando la ruta más larga.
Salen de la sede y vuelven a ella. Lo que no cabe se devuelve con su motivo.
"""

from dataclasses import dataclass, field

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from .tiempos import Punto, matriz_tiempos

# Penalizaciones por dejar una parada sin asignar: dominan cualquier coste de
# viaje o de equilibrio, así que el solver solo descarta lo que no cabe.
PENALIZACION_NORMAL = 1_000_000
PENALIZACION_URGENTE = 10_000_000
PENALIZACION_FIJA = 100_000_000
COEF_EQUILIBRIO = 10


@dataclass
class Parada:
    id: int
    punto: Punto
    servicio_min: int
    urgente: bool = False
    requiere_canasta: bool = False
    ruta_fija: str | None = None


@dataclass
class Ruta:
    id: str
    tiene_canasta: bool = False


@dataclass
class Visita:
    parada: Parada
    llegada_min: int


@dataclass
class RutaResuelta:
    id: str
    visitas: list[Visita] = field(default_factory=list)
    minutos_viaje: int = 0
    minutos_servicio: int = 0

    @property
    def minutos_total(self) -> int:
        return self.minutos_viaje + self.minutos_servicio


@dataclass
class Resultado:
    rutas: list[RutaResuelta]
    no_asignadas: list[tuple[Parada, str]]
    fuente_tiempos: str


def _motivo(parada: Parada, rutas: list[Ruta], urgentes: int) -> str:
    if parada.requiere_canasta and not any(r.tiene_canasta for r in rutas):
        return "Requiere canasta y ninguna ruta lleva camión canasta."
    if parada.urgente and urgentes > len(rutas):
        return "Hay más trabajos urgentes que rutas (cada ruta atiende un urgente, primero)."
    return "No cabe en la jornada de las rutas disponibles."


def optimizar(
    sede: Punto,
    rutas: list[Ruta],
    paradas: list[Parada],
    jornada_min: int,
    tiempo_limite_s: int = 10,
) -> Resultado:
    if not rutas or not paradas:
        motivo = "No hay rutas disponibles." if not rutas else ""
        return Resultado(
            rutas=[RutaResuelta(r.id) for r in rutas],
            no_asignadas=[(p, motivo) for p in paradas],
            fuente_tiempos="estimado",
        )

    matriz = matriz_tiempos([sede, *(p.punto for p in paradas)])
    tiempos = matriz.minutos
    servicio = [0, *(p.servicio_min for p in paradas)]
    n, v = len(paradas) + 1, len(rutas)
    indice_ruta = {r.id: i for i, r in enumerate(rutas)}

    manager = pywrapcp.RoutingIndexManager(n, v, 0)
    modelo = pywrapcp.RoutingModel(manager)

    def viaje(i, j):
        return tiempos[manager.IndexToNode(i)][manager.IndexToNode(j)]

    def viaje_mas_servicio(i, j):
        return viaje(i, j) + servicio[manager.IndexToNode(i)]

    cb_viaje = modelo.RegisterTransitCallback(viaje)
    cb_tiempo = modelo.RegisterTransitCallback(viaje_mas_servicio)
    modelo.SetArcCostEvaluatorOfAllVehicles(cb_viaje)
    modelo.AddDimension(cb_tiempo, 0, jornada_min, True, "Tiempo")
    dim_tiempo = modelo.GetDimensionOrDie("Tiempo")
    dim_tiempo.SetGlobalSpanCostCoefficient(COEF_EQUILIBRIO)

    con_canasta = [i for i, r in enumerate(rutas) if r.tiene_canasta]
    urgentes = sum(p.urgente for p in paradas)
    for nodo, p in enumerate(paradas, start=1):
        idx = manager.NodeToIndex(nodo)
        if p.ruta_fija is not None and p.ruta_fija in indice_ruta:
            modelo.VehicleVar(idx).SetValues([-1, indice_ruta[p.ruta_fija]])
            penalizacion = PENALIZACION_FIJA
        else:
            penalizacion = PENALIZACION_URGENTE if p.urgente else PENALIZACION_NORMAL
        if p.requiere_canasta:
            modelo.VehicleVar(idx).SetValues([-1, *con_canasta])
        modelo.AddDisjunction([idx], penalizacion)
        if p.urgente:
            # Solo puede ir inmediatamente después de salir de la sede.
            for otro in range(1, n):
                if otro != nodo:
                    modelo.NextVar(manager.NodeToIndex(otro)).RemoveValue(idx)

    parametros = pywrapcp.DefaultRoutingSearchParameters()
    parametros.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    parametros.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    parametros.time_limit.seconds = tiempo_limite_s
    solucion = modelo.SolveWithParameters(parametros)

    if solucion is None:
        return Resultado(
            rutas=[RutaResuelta(r.id) for r in rutas],
            no_asignadas=[(p, "No se encontró una solución factible.") for p in paradas],
            fuente_tiempos=matriz.fuente,
        )

    resueltas, asignadas = [], set()
    for vehiculo, ruta in enumerate(rutas):
        resuelta = RutaResuelta(ruta.id)
        idx = modelo.Start(vehiculo)
        while not modelo.IsEnd(idx):
            siguiente = solucion.Value(modelo.NextVar(idx))
            resuelta.minutos_viaje += viaje(idx, siguiente)
            nodo = manager.IndexToNode(siguiente)
            if not modelo.IsEnd(siguiente):
                parada = paradas[nodo - 1]
                llegada = solucion.Value(dim_tiempo.CumulVar(siguiente))
                resuelta.visitas.append(Visita(parada, llegada))
                resuelta.minutos_servicio += parada.servicio_min
                asignadas.add(parada.id)
            idx = siguiente
        resueltas.append(resuelta)

    return Resultado(
        rutas=resueltas,
        no_asignadas=[(p, _motivo(p, rutas, urgentes)) for p in paradas if p.id not in asignadas],
        fuente_tiempos=matriz.fuente,
    )
