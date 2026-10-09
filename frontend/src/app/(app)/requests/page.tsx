"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { DialogoMotivo } from "@/components/common/DialogoMotivo";
import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { ESTADO_SOLICITUD } from "@/components/common/estados";
import { PageHeader } from "@/components/common/PageHeader";
import { Paginacion } from "@/components/common/Paginacion";
import { SelectorCatalogo, TODOS } from "@/components/common/SelectorCatalogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";
import { etiqueta, useCatalogos } from "@/lib/api/hooks";
import type { Solicitud } from "@/lib/api/types";

const PESTANAS = [
  { valor: "abiertas", etiqueta: "Abiertas", estados: ["pendiente", "asignada"] },
  { valor: "pendiente", etiqueta: "Pendientes", estados: ["pendiente"] },
  { valor: "cerradas", etiqueta: "Cerradas", estados: ["completada", "no_completada", "cancelada"] },
  { valor: "todas", etiqueta: "Todas", estados: [] as string[] },
];

function EditarSolicitud({ solicitud, onCerrar }: { solicitud: Solicitud; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const [datos, setDatos] = useState({
    urgencia: solicitud.urgencia,
    fecha_programada: solicitud.fecha_programada,
    tiempo_servicio_estimado: solicitud.tiempo_servicio_estimado ?? null,
    descripcion: solicitud.descripcion,
  });
  const guardar = useMutation({
    mutationFn: () =>
      unwrap(api.PATCH("/api/solicitudes/{solicitud_id}", { params: { path: { solicitud_id: solicitud.id } }, body: datos })),
    onSuccess: () => {
      toast.success("Solicitud actualizada.");
      void queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
      onCerrar();
    },
  });
  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {solicitud.display_id}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-urgencia">Urgencia</Label>
            <SelectorCatalogo id="e-urgencia" items={catalogos.data?.urgencias} valor={datos.urgencia} onCambiar={(urgencia) => setDatos({ ...datos, urgencia })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-fecha">Fecha programada</Label>
            <Input id="e-fecha" type="date" value={datos.fecha_programada} onChange={(e) => setDatos({ ...datos, fecha_programada: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-minutos">Tiempo estimado (min)</Label>
            <Input
              id="e-minutos"
              type="number"
              min={1}
              value={datos.tiempo_servicio_estimado ?? ""}
              onChange={(e) => setDatos({ ...datos, tiempo_servicio_estimado: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="e-desc">Descripción</Label>
            <Textarea id="e-desc" value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SolicitudesPage() {
  const queryClient = useQueryClient();
  const { tieneRol } = useSesion();
  const catalogos = useCatalogos();
  const [pestana, setPestana] = useState("abiertas");
  const [urgencia, setUrgencia] = useState(TODOS);
  const [mias, setMias] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Solicitud | null>(null);
  const [cancelando, setCancelando] = useState<Solicitud | null>(null);

  const estados = PESTANAS.find((p) => p.valor === pestana)!.estados;
  const solicitudes = useQuery({
    queryKey: ["solicitudes", "lista", { estados, urgencia, mias, desde, hasta, pagina }],
    queryFn: () =>
      unwrap(
        api.GET("/api/solicitudes", {
          params: {
            query: {
              estado: estados.length ? estados : undefined,
              urgencia: urgencia === TODOS ? null : urgencia,
              mias,
              desde: desde || null,
              hasta: hasta || null,
              page: pagina,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
  const cancelar = useMutation({
    mutationFn: ({ s, motivo }: { s: Solicitud; motivo: string }) =>
      unwrap(api.POST("/api/solicitudes/{solicitud_id}/cancelar", { params: { path: { solicitud_id: s.id } }, body: { motivo } })),
    onSuccess: (s) => {
      toast.success(`Solicitud ${s.display_id} cancelada.`);
      void refrescar();
    },
  });
  const borrar = useMutation({
    mutationFn: (s: Solicitud) => unwrap(api.DELETE("/api/solicitudes/{solicitud_id}", { params: { path: { solicitud_id: s.id } } })),
    onSuccess: () => {
      toast.success("Solicitud eliminada.");
      void refrescar();
    },
  });
  const cambiarFiltro = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  };
  const esSupervisor = tieneRol("supervisor", "administrador");

  return (
    <>
      <PageHeader title="Solicitudes" description="Pedidos de trabajo sobre equipos, antes de asignarse a una orden.">
        <Button asChild>
          <Link href="/requests/create"><Plus /> Nueva solicitud</Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Tabs value={pestana} onValueChange={cambiarFiltro(setPestana)}>
          <TabsList>
            {PESTANAS.map((p) => (
              <TabsTrigger key={p.valor} value={p.valor}>{p.etiqueta}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="w-44">
          <SelectorCatalogo items={catalogos.data?.urgencias} valor={urgencia} onCambiar={cambiarFiltro(setUrgencia)} todos="Toda urgencia" />
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="Programadas desde" className="w-40" value={desde} onChange={(e) => cambiarFiltro(setDesde)(e.target.value)} />
          <span className="text-muted-foreground text-sm">a</span>
          <Input type="date" aria-label="Programadas hasta" className="w-40" value={hasta} onChange={(e) => cambiarFiltro(setHasta)(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={mias} onCheckedChange={cambiarFiltro(setMias)} /> Solo mías
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {solicitudes.isPending ? (
            <Cargando />
          ) : solicitudes.isError ? (
            <ErrorCarga error={solicitudes.error} />
          ) : !solicitudes.data.items.length ? (
            <Vacio texto="No hay solicitudes con estos filtros." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitud</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead className="hidden md:table-cell">Trabajo</TableHead>
                  <TableHead>Urgencia</TableHead>
                  <TableHead className="hidden sm:table-cell">Programada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Creada por</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitudes.data.items.map((s) => {
                  const estado = ESTADO_SOLICITUD[s.estado];
                  const abierta = s.estado === "pendiente" || s.estado === "asignada";
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.display_id}
                        {s.motivo_cancelacion && <div className="text-muted-foreground text-xs">{s.motivo_cancelacion}</div>}
                      </TableCell>
                      <TableCell>
                        <Link href={`/equipment/${encodeURIComponent(s.equipo)}`} className="text-primary hover:underline">{s.equipo}</Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {s.tipo_trabajo_nombre}
                        <span className="text-muted-foreground text-xs"> · {s.tiempo_servicio_estimado ?? "?"} min</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.urgencia === "urgente" ? "destructive" : "outline"}>{etiqueta(catalogos.data?.urgencias, s.urgencia)}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{format(new Date(`${s.fecha_programada}T12:00`), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={estado?.variante}>{estado?.etiqueta ?? s.estado}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{s.creado_por_nombre}</TableCell>
                      <TableCell>
                        {abierta && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Acciones de ${s.display_id}`}><MoreHorizontal /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {s.estado === "pendiente" && (
                                <DropdownMenuItem onClick={() => setEditando(s)}><Pencil /> Editar</DropdownMenuItem>
                              )}
                              {(s.estado === "pendiente" || esSupervisor) && (
                                <DropdownMenuItem onClick={() => setCancelando(s)}><Ban /> Cancelar</DropdownMenuItem>
                              )}
                              {s.estado === "pendiente" && esSupervisor && (
                                <DropdownMenuItem onClick={() => borrar.mutate(s)}><Trash2 /> Eliminar</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {solicitudes.data && <Paginacion pagina={pagina} total={solicitudes.data.count} porPagina={50} onCambiar={setPagina} />}

      {editando && <EditarSolicitud solicitud={editando} onCerrar={() => setEditando(null)} />}
      <DialogoMotivo
        abierto={!!cancelando}
        onCambiar={(a) => !a && setCancelando(null)}
        titulo={`Cancelar ${cancelando?.display_id ?? ""}`}
        descripcion={
          cancelando?.estado === "asignada"
            ? "La solicitud ya está en una orden de trabajo: también se cancelará su trabajo y se avisará a los técnicos."
            : "Se avisará a quien creó la solicitud."
        }
        textoConfirmar="Cancelar solicitud"
        destructivo
        sugerencias={catalogos.data?.respuestas_predefinidas.filter((r) => r.activo).map((r) => r.etiqueta)}
        onConfirmar={(motivo) => cancelar.mutateAsync({ s: cancelando!, motivo })}
      />
    </>
  );
}
