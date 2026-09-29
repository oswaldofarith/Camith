"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, FilePlus2, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";

import { Cargando, ErrorCarga } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";

import { CAMPOS_EXCLUSION, ESTADO_MANTENIMIENTO, ESTADO_PLAN } from "../estados";

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [errores, setErrores] = useState<string[]>([]);

  const plan = useQuery({
    queryKey: ["planes", id],
    queryFn: () => unwrap(api.GET("/api/planes-mantenimiento/{plan_id}", { params: { path: { plan_id: id } } })),
  });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["planes"] });
  const generar = useMutation({
    mutationFn: (items: number[] | null) =>
      unwrap(api.POST("/api/planes-mantenimiento/{plan_id}/generar-solicitudes", { params: { path: { plan_id: id } }, body: { items, tipo_trabajo: "Mantenimiento preventivo", urgencia: "normal" } })),
    onSuccess: (r) => {
      toast.success(`${r.creadas} solicitudes creadas.`);
      setErrores(r.errores);
      setSeleccion(new Set());
      void refrescar();
      void queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
    },
  });
  const cambiarEstado = useMutation({
    mutationFn: (estado: "borrador" | "activo" | "completado" | "archivado") =>
      unwrap(api.PATCH("/api/planes-mantenimiento/{plan_id}", { params: { path: { plan_id: id } }, body: { estado } })),
    onSuccess: () => void refrescar(),
  });
  const borrar = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/planes-mantenimiento/{plan_id}", { params: { path: { plan_id: id } } })),
    onSuccess: () => {
      toast.success("Plan eliminado.");
      void refrescar();
      router.replace("/maintenance");
    },
  });

  if (plan.isPending) return <Cargando />;
  if (plan.isError) return <ErrorCarga error={plan.error} />;
  const p = plan.data;
  const programados = p.calendario.filter((c) => c.estado === "programado");
  const alternar = (itemId: number) =>
    setSeleccion((s) => {
      const nueva = new Set(s);
      if (nueva.has(itemId)) nueva.delete(itemId);
      else nueva.add(itemId);
      return nueva;
    });

  return (
    <>
      <PageHeader title={p.nombre} description={`Creado el ${format(new Date(p.fecha_creacion), "dd/MM/yyyy")} · ${p.tiempo_de_ejecucion_dias} días hábiles`}>
        <Button variant="outline" asChild>
          <Link href="/maintenance"><ArrowLeft /> Planes</Link>
        </Button>
        <Select value={p.estado} onValueChange={(v) => cambiarEstado.mutate(v as "borrador")}>
          <SelectTrigger className="w-36" aria-label="Estado del plan"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(ESTADO_PLAN).map(([v, e]) => <SelectItem key={v} value={v}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          onClick={() => generar.mutate(seleccion.size ? [...seleccion] : null)}
          disabled={!programados.length || generar.isPending}
        >
          {generar.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
          {seleccion.size ? `Crear ${seleccion.size} solicitudes` : `Crear todas las solicitudes (${programados.length})`}
        </Button>
        <Button variant="destructive" size="icon" onClick={() => borrar.mutate()} aria-label="Eliminar plan"><Trash2 /></Button>
      </PageHeader>

      {!!errores.length && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Algunas solicitudes no se pudieron crear</AlertTitle>
          <AlertDescription><ul className="list-disc pl-4">{errores.map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {p.exclusiones.map((e, i) => (
          <Badge key={i} variant="outline">
            Excluye: {CAMPOS_EXCLUSION[e.campo as keyof typeof CAMPOS_EXCLUSION] ?? String(e.campo)} {e.operador === "no_es" ? "no es" : "es"} {String(e.valor)}
          </Badge>
        ))}
        {Object.entries(p.estadisticas).map(([k, v]) => (
          <Badge key={k} variant="secondary">{k.replace(/^total/, "").replace(/([A-Z])/g, " $1").trim()}: {String(v)}</Badge>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Calendario ({p.calendario.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><span className="sr-only">Seleccionar</span></TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead className="hidden md:table-cell">Motivo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.calendario.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.estado === "programado" && (
                      <Checkbox checked={seleccion.has(c.id)} onCheckedChange={() => alternar(c.id)} aria-label={`Seleccionar ${c.equipo}`} />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{format(new Date(`${c.fecha_programada}T12:00`), "EEE dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <Link href={`/equipment/${encodeURIComponent(c.equipo)}`} className="text-primary hover:underline">{c.equipo}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">{c.motivo_prioridad}</TableCell>
                  <TableCell>
                    <Badge variant={c.estado === "programado" ? "outline" : "default"}>{ESTADO_MANTENIMIENTO[c.estado] ?? c.estado}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
