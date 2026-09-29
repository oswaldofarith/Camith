"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, Loader2, Navigation, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { ESTADO_TRABAJO } from "@/components/common/estados";
import { PageHeader } from "@/components/common/PageHeader";
import { FotosTrabajo } from "@/components/trabajos/FotosTrabajo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";
import type { Trabajo } from "@/lib/api/types";

type Vista = "pendientes" | "reportados" | "todos";

function TarjetaTrabajo({ trabajo }: { trabajo: Trabajo }) {
  const queryClient = useQueryClient();
  const { usuario } = useSesion();
  const [detalles, setDetalles] = useState(trabajo.detalles);
  const [hallazgos, setHallazgos] = useState(trabajo.hallazgos);
  const estado = ESTADO_TRABAJO[trabajo.estado];
  // Puede reportar si está pendiente, o corregir lo que él mismo reportó.
  const editable =
    trabajo.estado === "Pendiente" ||
    ((trabajo.estado === "Completado" || trabajo.estado === "No Completado") && trabajo.completado_por_id === usuario?.id);

  const reportar = useMutation({
    mutationFn: (nuevo: "Completado" | "No Completado") =>
      unwrap(
        api.POST("/api/trabajos/{trabajo_id}/reportar", {
          params: { path: { trabajo_id: trabajo.id } },
          body: { estado: nuevo, detalles, hallazgos },
        }),
      ),
    onSuccess: (t) => {
      toast.success(`Trabajo ${t.codigo} marcado como ${t.estado.toLowerCase()}.`);
      void queryClient.invalidateQueries({ queryKey: ["trabajos"] });
    },
  });

  return (
    <Card className="border-l-4" style={{ borderLeftColor: estado?.color }}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {trabajo.secuencia}. {trabajo.equipo.codigo}
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              {trabajo.orden_display_id} · {trabajo.tipo_trabajo_nombre} · {trabajo.tiempo_servicio_estimado ?? "?"} min
            </p>
          </div>
          <Badge variant={estado?.variante}>{estado?.etiqueta ?? trabajo.estado}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span>{trabajo.equipo.direccion}</span>
          <Button variant="outline" size="sm" asChild>
            <a href={`geo:${trabajo.equipo.lat},${trabajo.equipo.lng}?q=${trabajo.equipo.lat},${trabajo.equipo.lng}(${encodeURIComponent(trabajo.equipo.codigo)})`}>
              <Navigation /> Cómo llegar
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {trabajo.equipo.requiere_canasta && <Badge variant="secondary">Requiere canasta</Badge>}
          {trabajo.equipo.zona_peligrosa && <Badge variant="destructive">Zona peligrosa</Badge>}
        </div>
        {trabajo.observacion_ingeniero && (
          <p className="bg-muted rounded-md p-2"><span className="font-medium">Observación:</span> {trabajo.observacion_ingeniero}</p>
        )}
        {trabajo.motivo_cancelacion && <p><span className="font-medium">Cancelado:</span> {trabajo.motivo_cancelacion}</p>}
        {editable ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`det-${trabajo.id}`}>Detalles del trabajo</Label>
              <Textarea id={`det-${trabajo.id}`} rows={2} value={detalles} onChange={(e) => setDetalles(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`hal-${trabajo.id}`}>Hallazgos</Label>
              <Textarea id={`hal-${trabajo.id}`} rows={2} value={hallazgos} onChange={(e) => setHallazgos(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            {trabajo.detalles && <p><span className="font-medium">Detalles:</span> {trabajo.detalles}</p>}
            {trabajo.hallazgos && <p><span className="font-medium">Hallazgos:</span> {trabajo.hallazgos}</p>}
          </>
        )}
        <FotosTrabajo trabajo={trabajo} editable={editable} />
      </CardContent>
      {editable && (
        <CardFooter className="grid grid-cols-2 gap-2">
          <Button onClick={() => reportar.mutate("Completado")} disabled={reportar.isPending}>
            {reportar.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Completado
          </Button>
          <Button variant="destructive" onClick={() => reportar.mutate("No Completado")} disabled={reportar.isPending || !detalles.trim()}>
            <XCircle /> No completado
          </Button>
          {!detalles.trim() && (
            <p className="text-muted-foreground col-span-2 text-xs">Para marcarlo como no completado, explica el motivo en “Detalles”.</p>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

export default function MisTrabajosPage() {
  const [vista, setVista] = useState<Vista>("pendientes");
  const estados = { pendientes: ["Pendiente"], reportados: ["Completado", "No Completado"], todos: [] as string[] }[vista];
  const trabajos = useQuery({
    queryKey: ["trabajos", "mios", vista],
    queryFn: () => unwrap(api.GET("/api/trabajos/mios", { params: { query: { estado: estados.length ? estados : undefined } } })),
    refetchInterval: 60_000,
  });

  // Agrupados por orden, en el orden de la ruta.
  const grupos = new Map<string, Trabajo[]>();
  for (const t of trabajos.data ?? []) grupos.set(t.orden_display_id, [...(grupos.get(t.orden_display_id) ?? []), t]);

  return (
    <>
      <PageHeader title="Mis trabajos" description={format(new Date(), "EEEE d 'de' MMMM", { locale: es })} />
      <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="reportados">Reportados</TabsTrigger>
          <TabsTrigger value="todos">Todos</TabsTrigger>
        </TabsList>
      </Tabs>
      {trabajos.isPending ? (
        <Cargando />
      ) : trabajos.isError ? (
        <ErrorCarga error={trabajos.error} />
      ) : !trabajos.data.length ? (
        <Vacio texto={vista === "pendientes" ? "No tienes trabajos pendientes. ¡Buen trabajo!" : "No hay trabajos."} />
      ) : (
        <div className="space-y-6">
          {[...grupos.entries()].map(([orden, lista]) => (
            <section key={orden} className="space-y-3">
              <h2 className="text-muted-foreground text-sm font-semibold">Orden {orden}</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {lista.map((t) => (
                  <TarjetaTrabajo key={t.id} trabajo={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
