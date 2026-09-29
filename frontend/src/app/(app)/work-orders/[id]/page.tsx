"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowLeft, Ban, ClipboardCheck, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";

import { DialogoMotivo } from "@/components/common/DialogoMotivo";
import { Cargando, ErrorCarga } from "@/components/common/Estado";
import { ESTADO_ORDEN, ESTADO_TRABAJO } from "@/components/common/estados";
import { PageHeader } from "@/components/common/PageHeader";
import { DialogoRevision } from "@/components/trabajos/DialogoRevision";
import { FotosTrabajo } from "@/components/trabajos/FotosTrabajo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";
import { useCatalogos, useUsuarios } from "@/lib/api/hooks";
import type { Trabajo } from "@/lib/api/types";

const fechaHora = (v?: string | null) => (v ? format(new Date(v), "dd/MM/yyyy HH:mm") : "—");

export default function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tieneRol } = useSesion();
  const catalogos = useCatalogos();
  const usuarios = useUsuarios();
  const [revisando, setRevisando] = useState<Trabajo | null>(null);
  const [cancelando, setCancelando] = useState<Trabajo | null>(null);
  const [borrando, setBorrando] = useState(false);

  const orden = useQuery({
    queryKey: ["ordenes", "detalle", id],
    queryFn: () => unwrap(api.GET("/api/ordenes/{orden_id}", { params: { path: { orden_id: id } } })),
  });
  const cancelar = useMutation({
    mutationFn: ({ t, motivo }: { t: Trabajo; motivo: string }) =>
      unwrap(api.POST("/api/trabajos/{trabajo_id}/cancelar", { params: { path: { trabajo_id: t.id } }, body: { motivo } })),
    onSuccess: (t) => {
      toast.success(`Trabajo ${t.codigo} cancelado.`);
      void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
    },
  });
  const borrar = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/ordenes/{orden_id}", { params: { path: { orden_id: id } } })),
    onSuccess: () => {
      toast.success("Orden eliminada; sus solicitudes vuelven a estar pendientes.");
      void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      void queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
      router.replace("/work-orders");
    },
  });

  if (orden.isPending) return <Cargando />;
  if (orden.isError) return <ErrorCarga error={orden.error} />;
  const o = orden.data;
  const nombre = (uid: number | null) => usuarios.data?.find((u) => u.id === uid)?.nombre ?? "—";
  const esGestor = tieneRol("supervisor", "administrador");
  const puedeRevisar = tieneRol("ingenieroDeOficina", "supervisor", "administrador");
  const todosPendientes = o.trabajos.every((t) => t.estado === "Pendiente");
  const minutos = o.trabajos.reduce((s, t) => s + (t.tiempo_servicio_estimado ?? 0), 0);

  return (
    <>
      <PageHeader title={`Orden ${o.display_id}`} description={`Creada el ${fechaHora(o.fecha_creacion)} por ${o.creado_por_nombre}`}>
        <Badge variant={ESTADO_ORDEN[o.estado_general]?.variante} className="text-sm">
          {ESTADO_ORDEN[o.estado_general]?.etiqueta ?? o.estado_general}
        </Badge>
        <Button variant="outline" asChild>
          <Link href="/work-orders"><ArrowLeft /> Órdenes</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/print/work-order/${o.id}`} target="_blank"><Printer /> Imprimir</Link>
        </Button>
        {esGestor && todosPendientes && (
          <Button variant="destructive" size="icon" onClick={() => setBorrando(true)} aria-label="Eliminar orden"><Trash2 /></Button>
        )}
      </PageHeader>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {o.unidades.map((u) => (
          <Card key={u.vehiculo}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{u.placa} {u.ruta_id && <span className="text-muted-foreground text-xs font-normal">· {u.ruta_id}</span>}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">{u.tecnicos.map((t) => t.nombre).join(", ")}</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Resumen</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {o.trabajos.length} trabajos · {Math.floor(minutos / 60)} h {minutos % 60} min de servicio estimado
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {o.trabajos.map((t) => {
          const estado = ESTADO_TRABAJO[t.estado];
          const abierto = t.estado !== "Cancelado";
          return (
            <Card key={t.id} className="border-l-4" style={{ borderLeftColor: estado?.color }}>
              <CardContent className="grid gap-4 pt-6 lg:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.secuencia}. {t.codigo}</span>
                    <Badge variant={estado?.variante}>{estado?.etiqueta ?? t.estado}</Badge>
                    {t.requiere_nueva_revision && (
                      <Badge variant="outline"><AlertTriangle className="size-3" /> Nueva revisión {t.fecha_nueva_revision ?? ""}</Badge>
                    )}
                  </div>
                  <div className="text-sm">
                    <Link href={`/equipment/${encodeURIComponent(t.equipo.codigo)}`} className="text-primary hover:underline">{t.equipo.codigo}</Link>
                    {" · "}{catalogos.data?.tipos_equipo.find((x) => x.valor === t.equipo.tipo)?.etiqueta ?? t.equipo.tipo}
                    {" · "}{t.tipo_trabajo_nombre} ({t.tiempo_servicio_estimado ?? "?"} min)
                  </div>
                  <div className="text-muted-foreground text-xs">{t.equipo.direccion}</div>
                  <div className="flex gap-1">
                    {t.equipo.requiere_canasta && <Badge variant="secondary">Canasta</Badge>}
                    {t.equipo.zona_peligrosa && <Badge variant="destructive">Zona peligrosa</Badge>}
                  </div>
                  <div className="text-muted-foreground text-xs">Solicitud {t.solicitud_display_id}</div>
                </div>
                <div className="space-y-2 text-sm">
                  {t.fecha_finalizacion && (
                    <div className="text-muted-foreground text-xs">
                      {t.estado === "Cancelado" ? "Cancelado" : "Reportado"} por {nombre(t.completado_por_id)} el {fechaHora(t.fecha_finalizacion)}
                    </div>
                  )}
                  {t.motivo_cancelacion && <p><span className="font-medium">Motivo:</span> {t.motivo_cancelacion}</p>}
                  {t.detalles && <p><span className="font-medium">Detalles:</span> {t.detalles}</p>}
                  {t.hallazgos && <p><span className="font-medium">Hallazgos:</span> {t.hallazgos}</p>}
                  {t.observacion_ingeniero && (
                    <p className="bg-muted rounded-md p-2">
                      <span className="font-medium">Observación de {nombre(t.observacion_ingeniero_por_id)}:</span> {t.observacion_ingeniero}
                    </p>
                  )}
                  <FotosTrabajo trabajo={t} />
                </div>
                <div className="flex gap-2 lg:flex-col">
                  {puedeRevisar && abierto && (
                    <Button size="sm" variant="outline" onClick={() => setRevisando(t)}><ClipboardCheck /> Revisar</Button>
                  )}
                  {esGestor && abierto && (
                    <Button size="sm" variant="outline" onClick={() => setCancelando(t)}><Ban /> Cancelar</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {revisando && <DialogoRevision trabajo={revisando} onCerrar={() => setRevisando(null)} />}
      <DialogoMotivo
        abierto={!!cancelando}
        onCambiar={(a) => !a && setCancelando(null)}
        titulo={`Cancelar ${cancelando?.codigo ?? ""}`}
        descripcion="También se cancelará su solicitud y se avisará a los técnicos."
        textoConfirmar="Cancelar trabajo"
        destructivo
        sugerencias={catalogos.data?.respuestas_predefinidas.filter((r) => r.activo).map((r) => r.etiqueta)}
        onConfirmar={(motivo) => cancelar.mutateAsync({ t: cancelando!, motivo })}
      />
      <AlertDialog open={borrando} onOpenChange={setBorrando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la orden {o.display_id}?</AlertDialogTitle>
            <AlertDialogDescription>Sus {o.trabajos.length} solicitudes volverán a quedar pendientes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => borrar.mutate()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
