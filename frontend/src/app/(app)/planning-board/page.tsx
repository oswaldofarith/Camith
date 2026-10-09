"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Route, Save, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SERIES } from "@/components/common/estados";
import { LineaRuta, Mapa, MarcadorParada, MarcadorSede } from "@/components/mapa";
import { horaMas, limites } from "@/components/mapa/utilidades";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { useDirectorio } from "@/lib/api/hooks";

type Plan = components["schemas"]["PlanRutasOut"];
type Visita = Plan["rutas"][number]["visitas"][number];
type ConfigRuta = { id: string; vehiculos: string[] };

const color = (i: number) => SERIES[i % SERIES.length];
const nuevaId = (n: number) => `R${n}`;

export default function TableroPlanificacionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hasta, setHasta] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [rutas, setRutas] = useState<ConfigRuta[]>([{ id: "R1", vehiculos: [] }]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [editado, setEditado] = useState(false);
  const [resaltada, setResaltada] = useState<number | null>(null);

  const vehiculos = useQuery({
    queryKey: ["vehiculos", "disponible"],
    queryFn: () => unwrap(api.GET("/api/vehiculos", { params: { query: { estado: "disponible" } } })),
  });
  const unidades = useQuery({ queryKey: ["unidades-campo"], queryFn: () => unwrap(api.GET("/api/unidades-campo")) });
  const tecnicos = useDirectorio({ rol: "tecnicoDeCampo" });

  const composicion = useMemo(
    () => Object.fromEntries((unidades.data ?? []).map((u) => [u.vehiculo, u.tecnicos])),
    [unidades.data],
  );
  const usados = new Set(rutas.flatMap((r) => r.vehiculos));
  const nombreTecnico = (id: number) => tecnicos.data?.find((t) => t.id === id)?.nombre ?? `#${id}`;
  const placa = (codigo: string) => vehiculos.data?.find((v) => v.codigo === codigo)?.placa ?? codigo;
  const sinTecnicos = rutas.flatMap((r) => r.vehiculos).filter((v) => !composicion[v]?.length);

  function cargarDesdeUnidades() {
    const conTecnicos = (unidades.data ?? []).filter((u) => u.tecnicos.length);
    if (!conTecnicos.length) {
      toast.error("No hay unidades de campo con técnicos asignados.");
      return;
    }
    setRutas(conTecnicos.map((u, i) => ({ id: nuevaId(i + 1), vehiculos: [u.vehiculo] })));
    setPlan(null);
  }

  const optimizar = useMutation({
    mutationFn: (respetarAsignacion: boolean) =>
      unwrap(
        api.POST("/api/planificacion/optimizar", {
          body: {
            fecha: hasta,
            solicitudes: null,
            tiempo_limite_s: 10,
            rutas: rutas
              .filter((r) => r.vehiculos.length)
              .map((r) => ({
                ...r,
                // "Recalcular" fija cada parada a la ruta donde la dejó el supervisor.
                fijas: respetarAsignacion ? plan?.rutas.find((p) => p.id === r.id)?.visitas.map((v) => v.solicitud_id) ?? [] : [],
              })),
          },
        }),
      ),
    onSuccess: (p) => {
      setPlan(p);
      setEditado(false);
      const asignadas = p.rutas.reduce((n, r) => n + r.visitas.length, 0);
      toast.success(`${asignadas} solicitudes asignadas en ${p.rutas.filter((r) => r.visitas.length).length} rutas.`);
    },
  });

  function editar(cambio: (p: Plan) => void) {
    if (!plan) return;
    const copia: Plan = structuredClone(plan);
    cambio(copia);
    setPlan(copia);
    setEditado(true);
  }
  const mover = (origen: string, i: number, destino: string) =>
    editar((p) => {
      const [v] = p.rutas.find((r) => r.id === origen)!.visitas.splice(i, 1);
      p.rutas.find((r) => r.id === destino)!.visitas.push(v);
    });
  const reordenar = (ruta: string, i: number, delta: number) =>
    editar((p) => {
      const lista = p.rutas.find((r) => r.id === ruta)!.visitas;
      [lista[i], lista[i + delta]] = [lista[i + delta], lista[i]];
    });
  const quitar = (ruta: string, i: number) =>
    editar((p) => {
      const [v] = p.rutas.find((r) => r.id === ruta)!.visitas.splice(i, 1);
      p.no_asignadas.push({ ...v, motivo: "Quitada manualmente." });
    });

  const crear = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/ordenes", {
          body: plan!.rutas
            .filter((r) => r.visitas.length)
            .map((r) => ({
              unidades: r.vehiculos.map((v) => ({ ruta_id: r.id, vehiculo: v, tecnicos: composicion[v] ?? [] })),
              solicitudes: r.visitas.map((v) => v.solicitud_id),
            })),
        }),
      ),
    onSuccess: (ordenes) => {
      toast.success(`${ordenes.length} órdenes creadas: ${ordenes.map((o) => o.display_id).join(", ")}. Se notificó a los técnicos.`);
      void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      void queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
      void queryClient.invalidateQueries({ queryKey: ["planificacion"] });
      router.push("/work-orders");
    },
  });

  const puntos = plan ? [plan.sede, ...plan.rutas.flatMap((r) => r.visitas), ...plan.no_asignadas] : [];
  const encuadre = limites(puntos);
  const listas = rutas.some((r) => r.vehiculos.length) && !sinTecnicos.length;

  return (
    <>
      <PageHeader title="Tablero de planificación" description="Arma las rutas del día, optimízalas y confírmalas como órdenes de trabajo." />
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1. Rutas</CardTitle>
              <CardDescription>Cada ruta es una o más unidades que salen juntas. Un camión canasta necesita otra unidad acompañante.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="hasta">Solicitudes pendientes programadas hasta</Label>
                <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={cargarDesdeUnidades}>
                Una ruta por unidad de campo
              </Button>
              {rutas.map((r, i) => (
                <div key={r.id} className="space-y-2 rounded-md border p-2" style={{ borderLeft: `4px solid ${color(i)}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Ruta {r.id}</span>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setRutas((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`Eliminar ruta ${r.id}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {r.vehiculos.map((v) => (
                    <div key={v} className="bg-muted flex items-center justify-between rounded px-2 py-1 text-xs">
                      <span>
                        <span className="font-medium">{placa(v)}</span>{" "}
                        {composicion[v]?.length ? (
                          <span className="text-muted-foreground">· {composicion[v].map(nombreTecnico).join(", ")}</span>
                        ) : (
                          <span className="text-destructive">· sin técnicos</span>
                        )}
                      </span>
                      <button type="button" onClick={() => setRutas((rs) => rs.map((x) => (x.id === r.id ? { ...x, vehiculos: x.vehiculos.filter((c) => c !== v) } : x)))} aria-label={`Quitar ${placa(v)}`}>
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  <Select value="" onValueChange={(v) => setRutas((rs) => rs.map((x) => (x.id === r.id ? { ...x, vehiculos: [...x.vehiculos, v] } : x)))}>
                    <SelectTrigger className="h-8" aria-label={`Añadir vehículo a la ruta ${r.id}`}><SelectValue placeholder="Añadir vehículo" /></SelectTrigger>
                    <SelectContent>
                      {(vehiculos.data ?? []).filter((v) => !usados.has(v.codigo)).map((v) => (
                        <SelectItem key={v.codigo} value={v.codigo}>{v.placa} · {v.tipo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setRutas((rs) => [...rs, { id: nuevaId(Math.max(0, ...rs.map((x) => Number(x.id.slice(1)) || 0)) + 1), vehiculos: [] }])}>
                <Plus /> Añadir ruta
              </Button>
              {!!sinTecnicos.length && (
                <p className="text-destructive text-xs">Asigna técnicos a {sinTecnicos.map(placa).join(", ")} en Unidades de campo.</p>
              )}
              <Button className="w-full" onClick={() => optimizar.mutate(false)} disabled={!listas || optimizar.isPending}>
                {optimizar.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} 2. Optimizar rutas
              </Button>
            </CardContent>
          </Card>
          {plan && (
            <Alert>
              <Route />
              <AlertDescription>
                Tiempos {plan.fuente_tiempos === "osrm" ? "calculados por calles (OSRM)" : "estimados por distancia (motor de rutas no disponible)"} ·
                jornada útil {Math.floor(plan.jornada_min / 60)} h {plan.jornada_min % 60} min · salida {plan.hora_inicio ?? "—"}.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-4">
          <Mapa key={encuadre ? JSON.stringify(encuadre) : "vacio"} className="h-[32rem]" initialViewState={encuadre ? { bounds: encuadre, fitBoundsOptions: { padding: 48 } } : undefined}>
            {plan && (
              <>
                {!editado && plan.rutas.map((r, i) => <LineaRuta key={r.id} id={r.id} coordenadas={r.geometria} color={color(i)} />)}
                <MarcadorSede {...plan.sede} />
                {plan.rutas.flatMap((r, i) =>
                  r.visitas.map((v, orden) => (
                    <MarcadorParada
                      key={v.solicitud_id}
                      lat={v.lat}
                      lng={v.lng}
                      texto={orden + 1}
                      color={color(i)}
                      resaltado={resaltada === v.solicitud_id}
                      titulo={`Ruta ${r.id} · ${orden + 1}. ${v.equipo} (${v.display_id})`}
                      onClick={() => setResaltada(v.solicitud_id)}
                    />
                  )),
                )}
                {plan.no_asignadas.map((n) => (
                  <MarcadorParada key={n.solicitud_id} lat={n.lat} lng={n.lng} texto="!" color="var(--estado-cancelado)" titulo={`Sin asignar: ${n.equipo} — ${n.motivo}`} />
                ))}
              </>
            )}
          </Mapa>

          {plan && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => optimizar.mutate(true)} disabled={!editado || optimizar.isPending}>
                  <RefreshCw /> Recalcular respetando mis cambios
                </Button>
                <Button className="ml-auto" onClick={() => crear.mutate()} disabled={crear.isPending || !plan.rutas.some((r) => r.visitas.length)}>
                  {crear.isPending ? <Loader2 className="animate-spin" /> : <Save />} 3. Crear órdenes
                </Button>
              </div>
              {editado && (
                <p className="text-muted-foreground text-xs">Has modificado la propuesta: las horas y los trazados se actualizan al recalcular.</p>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                {plan.rutas.map((r, i) => (
                  <Card key={r.id} style={{ borderTop: `4px solid ${color(i)}` }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Ruta {r.id} · {r.vehiculos.map(placa).join(" + ")}</CardTitle>
                      <CardDescription>
                        {r.visitas.length} paradas · {r.minutos_servicio} min de servicio + {r.minutos_viaje} min de viaje
                        {!editado && r.visitas.length > 0 && <> · regreso ≈ {horaMas(plan.hora_inicio, r.minutos_total)}</>}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-1">
                        {r.visitas.map((v: Visita, orden) => (
                          <li key={v.solicitud_id} className={`flex items-center gap-1 rounded px-1 text-sm ${resaltada === v.solicitud_id ? "bg-muted" : ""}`} onMouseEnter={() => setResaltada(v.solicitud_id)}>
                            <span className="text-muted-foreground w-12 text-xs tabular-nums">{editado ? "" : horaMas(plan.hora_inicio, v.llegada_min)}</span>
                            <span className="flex-1 truncate">
                              {orden + 1}. {v.equipo}
                              {v.urgente && <Badge variant="destructive" className="ml-1">Urgente</Badge>}
                              {v.requiere_canasta && <Badge variant="secondary" className="ml-1">Canasta</Badge>}
                            </span>
                            <Button variant="ghost" size="icon" className="size-6" disabled={orden === 0} onClick={() => reordenar(r.id, orden, -1)} aria-label="Subir"><ArrowUp className="size-3" /></Button>
                            <Button variant="ghost" size="icon" className="size-6" disabled={orden === r.visitas.length - 1} onClick={() => reordenar(r.id, orden, 1)} aria-label="Bajar"><ArrowDown className="size-3" /></Button>
                            <Select value="" onValueChange={(destino) => mover(r.id, orden, destino)}>
                              <SelectTrigger className="h-6 w-20 px-1 text-xs" aria-label={`Mover ${v.equipo} a otra ruta`}><SelectValue placeholder="Mover" /></SelectTrigger>
                              <SelectContent>
                                {plan.rutas.filter((x) => x.id !== r.id).map((x) => <SelectItem key={x.id} value={x.id}>Ruta {x.id}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="size-6" onClick={() => quitar(r.id, orden)} aria-label={`Quitar ${v.equipo}`}><X className="size-3" /></Button>
                          </li>
                        ))}
                        {!r.visitas.length && <li className="text-muted-foreground text-sm">Sin paradas.</li>}
                      </ol>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {!!plan.no_asignadas.length && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4" /> Sin asignar ({plan.no_asignadas.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-sm">
                      {plan.no_asignadas.map((n) => (
                        <li key={n.solicitud_id}>
                          <span className="font-medium">{n.display_id} · {n.equipo}</span>
                          {n.urgente && <Badge variant="destructive" className="ml-1">Urgente</Badge>}
                          <span className="text-muted-foreground"> — {n.motivo}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
