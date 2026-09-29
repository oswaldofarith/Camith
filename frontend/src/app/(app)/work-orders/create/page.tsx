"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Cargando, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, unwrap } from "@/lib/api/client";
import { useUsuarios } from "@/lib/api/hooks";
import type { Solicitud } from "@/lib/api/types";

export default function CrearOrdenPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [texto, setTexto] = useState("");
  const [vehiculo, setVehiculo] = useState("");
  const [tecnicosElegidos, setTecnicos] = useState<number[] | null>(null);
  const [ruta, setRuta] = useState<Solicitud[]>([]);

  const pendientes = useQuery({
    queryKey: ["solicitudes", "pendientes", hasta],
    queryFn: () =>
      unwrap(api.GET("/api/solicitudes", { params: { query: { estado: ["pendiente"], hasta: hasta || null, page: 1 } } })),
  });
  const vehiculos = useQuery({
    queryKey: ["vehiculos", "disponible"],
    queryFn: () => unwrap(api.GET("/api/vehiculos", { params: { query: { estado: "disponible" } } })),
  });
  const unidades = useQuery({ queryKey: ["unidades-campo"], queryFn: () => unwrap(api.GET("/api/unidades-campo")) });
  const tecnicos = useUsuarios({ rol: "tecnicoDeCampo", activo: true });

  // Técnicos: los elegidos a mano o, si no, la composición habitual del vehículo.
  const tecnicosRuta = tecnicosElegidos ?? unidades.data?.find((u) => u.vehiculo === vehiculo)?.tecnicos ?? [];
  const q = texto.trim().toLowerCase();
  const disponibles = useMemo(() => {
    const enRuta = new Set(ruta.map((s) => s.id));
    return (pendientes.data?.items ?? []).filter(
      (s) => !enRuta.has(s.id) && (!q || `${s.display_id} ${s.equipo} ${s.tipo_trabajo_nombre}`.toLowerCase().includes(q)),
    );
  }, [pendientes.data, ruta, q]);
  const minutos = ruta.reduce((m, s) => m + (s.tiempo_servicio_estimado ?? 0), 0);

  const mover = (i: number, delta: number) =>
    setRuta((r) => {
      const copia = [...r];
      [copia[i], copia[i + delta]] = [copia[i + delta], copia[i]];
      return copia;
    });

  const crear = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/ordenes", {
          body: [{ unidades: [{ ruta_id: "", vehiculo, tecnicos: tecnicosRuta }], solicitudes: ruta.map((s) => s.id) }],
        }),
      ),
    onSuccess: ([orden]) => {
      toast.success(`Orden ${orden.display_id} creada. Se notificó a los técnicos.`);
      void queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
      void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      router.push(`/work-orders/${orden.id}`);
    },
  });

  return (
    <>
      <PageHeader title="Nueva orden de trabajo" description="Arma una ruta con solicitudes pendientes para una unidad de campo." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes pendientes</CardTitle>
            <CardDescription>Programadas hasta la fecha indicada.</CardDescription>
            <div className="flex gap-2 pt-2">
              <Input type="date" aria-label="Programadas hasta" className="w-44" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              <Input placeholder="Buscar solicitud, equipo o trabajo" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="max-h-[60svh] space-y-2 overflow-y-auto">
            {pendientes.isPending ? (
              <Cargando />
            ) : !disponibles.length ? (
              <Vacio texto="No hay solicitudes pendientes." />
            ) : (
              disponibles.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">
                      {s.display_id} · {s.equipo}
                      {s.urgencia === "urgente" && <Badge variant="destructive" className="ml-2">Urgente</Badge>}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {s.tipo_trabajo_nombre} · {s.tiempo_servicio_estimado ?? "?"} min · {format(new Date(`${s.fecha_programada}T12:00`), "dd/MM")}
                    </div>
                  </div>
                  <Button size="icon" variant="outline" onClick={() => setRuta((r) => [...r, s])} aria-label={`Añadir ${s.display_id} a la ruta`}>
                    <Plus />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ruta</CardTitle>
            <CardDescription>
              {ruta.length} trabajos · {Math.floor(minutos / 60)} h {minutos % 60} min de servicio (sin contar traslados)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vehiculo">Vehículo</Label>
              <Select
                value={vehiculo}
                onValueChange={(v) => {
                  setVehiculo(v);
                  setTecnicos(null);
                }}
              >
                <SelectTrigger id="vehiculo"><SelectValue placeholder="Elige un vehículo disponible" /></SelectTrigger>
                <SelectContent>
                  {(vehiculos.data ?? []).map((v) => (
                    <SelectItem key={v.codigo} value={v.codigo}>{v.placa} (unidad {v.codigo})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Técnicos</Label>
              <div className="grid grid-cols-2 gap-2">
                {(tecnicos.data ?? []).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={tecnicosRuta.includes(t.id)}
                      disabled={!vehiculo}
                      onCheckedChange={(marcado) =>
                        setTecnicos(marcado ? [...tecnicosRuta, t.id] : tecnicosRuta.filter((x) => x !== t.id))
                      }
                    />
                    {t.nombre}
                  </label>
                ))}
              </div>
            </div>
            <ol className="space-y-2">
              {ruta.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs">{i + 1}</span>
                  <span className="flex-1">
                    {s.display_id} · {s.equipo}
                    <span className="text-muted-foreground block text-xs">{s.tipo_trabajo_nombre}</span>
                  </span>
                  <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp /></Button>
                  <Button size="icon" variant="ghost" disabled={i === ruta.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setRuta((r) => r.filter((x) => x.id !== s.id))} aria-label={`Quitar ${s.display_id}`}><X /></Button>
                </li>
              ))}
              {!ruta.length && <li className="text-muted-foreground text-sm">Añade solicitudes desde la lista.</li>}
            </ol>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={() => crear.mutate()} disabled={!vehiculo || !tecnicosRuta.length || !ruta.length || crear.isPending}>
              {crear.isPending && <Loader2 className="animate-spin" />}
              Crear orden
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
