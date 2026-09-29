"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, FilePlus2, Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Paginacion } from "@/components/common/Paginacion";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";
import { etiqueta, useCatalogos, useUsuarios } from "@/lib/api/hooks";

import { FormularioEquipo } from "../formulario-equipo";

const LOGOS: Record<string, string> = {
  honeywell: "/images/honeywellLogo.webp",
  itron: "/images/itronLogo.webp",
  trilliant: "/images/trilliantLogo.webp",
};

const fecha = (v?: string | null, conHora = false) => (v ? format(new Date(v), conHora ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy") : "—");

function Dato({ etiqueta: e, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{e}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function EquipoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = decodeURIComponent(use(params).codigo);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tieneRol } = useSesion();
  const catalogos = useCatalogos();
  const usuarios = useUsuarios();
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [pagina, setPagina] = useState(1);

  const equipo = useQuery({
    queryKey: ["equipos", "detalle", codigo],
    queryFn: () => unwrap(api.GET("/api/equipos/{codigo}", { params: { path: { codigo } } })),
  });
  const trabajos = useQuery({
    queryKey: ["trabajos", "equipo", codigo, pagina],
    queryFn: () => unwrap(api.GET("/api/trabajos", { params: { query: { equipo: codigo, page: pagina } } })),
  });
  const borrar = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/equipos/{codigo}", { params: { path: { codigo } } })),
    onSuccess: () => {
      toast.success(`Equipo ${codigo} eliminado.`);
      void queryClient.invalidateQueries({ queryKey: ["equipos"] });
      router.replace("/equipment");
    },
  });
  const nombre = (id: number | null) => usuarios.data?.find((u) => u.id === id)?.nombre ?? "—";

  if (equipo.isPending) return <Cargando />;
  if (equipo.isError) return <ErrorCarga error={equipo.error} />;
  const e = equipo.data;
  const c = catalogos.data;

  return (
    <>
      <PageHeader title={`Equipo ${e.codigo}`} description={e.direccion}>
        <Button variant="outline" asChild>
          <Link href="/equipment"><ArrowLeft /> Equipos</Link>
        </Button>
        {tieneRol("ingenieroDeOficina", "supervisor", "administrador") && (
          <Button variant="secondary" asChild>
            <Link href={`/requests/create?equipo=${encodeURIComponent(e.codigo)}`}><FilePlus2 /> Crear solicitud</Link>
          </Button>
        )}
        {tieneRol("administrador", "supervisor") && (
          <>
            <Button onClick={() => setEditando(true)}><Pencil /> Editar</Button>
            <Button variant="destructive" size="icon" onClick={() => setBorrando(true)} aria-label="Eliminar equipo"><Trash2 /></Button>
          </>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Información</CardTitle>
            {LOGOS[e.marca] && <Image src={LOGOS[e.marca]} alt={etiqueta(c?.marcas, e.marca)} width={120} height={32} className="h-8 w-auto" />}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Dato etiqueta="Tipo">{etiqueta(c?.tipos_equipo, e.tipo)}</Dato>
              <Dato etiqueta="Marca">{etiqueta(c?.marcas, e.marca)}</Dato>
              <Dato etiqueta="Zona">{etiqueta(c?.zonas, e.zona)}</Dato>
              <Dato etiqueta="Estado"><Badge variant={e.estado === "activo" ? "default" : "outline"}>{etiqueta(c?.estados_equipo, e.estado)}</Badge></Dato>
              <Dato etiqueta="Comunicación">{e.tipo_comunicacion}</Dato>
              <Dato etiqueta="IP">{e.ip ?? "—"}</Dato>
              <Dato etiqueta="Piloto">{e.piloto || "—"}</Dato>
              <Dato etiqueta="Coordenadas">{e.lat.toFixed(6)}, {e.lng.toFixed(6)}</Dato>
              <Dato etiqueta="Fabricación">{fecha(e.fecha_fabricacion)}</Dato>
              <Dato etiqueta="Requiere canasta">{e.requiere_canasta ? "Sí" : "No"}</Dato>
              <Dato etiqueta="Zona peligrosa">{e.zona_peligrosa ? "Sí" : "No"}</Dato>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mantenimiento</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Dato etiqueta="Última revisión">{fecha(e.fecha_ultima_revision)}</Dato>
              <Dato etiqueta="Revisiones">{e.revision_count}</Dato>
              <Dato etiqueta="Próximo programado">{fecha(e.proximo_mantenimiento_programado)}</Dato>
              <Dato etiqueta="Cada (días)">{e.intervalo_mantenimiento_dias ?? "—"}</Dato>
              <Dato etiqueta="Cada (revisiones)">{e.intervalo_mantenimiento_revisiones ?? "—"}</Dato>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Historial de trabajos ({trabajos.data?.count ?? 0})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {trabajos.isPending ? (
              <Cargando />
            ) : !trabajos.data?.items.length ? (
              <Vacio texto="Este equipo aún no tiene trabajos." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trabajo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">Finalizado</TableHead>
                    <TableHead className="hidden md:table-cell">Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trabajos.data.items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link href={`/work-orders/${t.orden_id}`} className="text-primary hover:underline">{t.codigo}</Link>
                      </TableCell>
                      <TableCell>{t.tipo_trabajo_nombre}</TableCell>
                      <TableCell><Badge variant="outline">{t.estado}</Badge></TableCell>
                      <TableCell className="hidden md:table-cell">{fecha(t.fecha_finalizacion, true)}</TableCell>
                      <TableCell className="hidden md:table-cell">{nombre(t.completado_por_id)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Historial de estados</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {e.estado_historial.map((h, i) => (
                <li key={i} className="border-l-2 pl-3 text-sm">
                  <div className="font-medium">{etiqueta(c?.estados_equipo, h.estado)}</div>
                  <div className="text-muted-foreground text-xs">{fecha(h.fecha, true)} · {nombre(h.modificado_por_id)}</div>
                  {h.motivo && <div className="text-xs">{h.motivo}</div>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      {trabajos.data && <Paginacion pagina={pagina} total={trabajos.data.count} porPagina={50} onCambiar={setPagina} />}

      {editando && (
        <FormularioEquipo
          equipo={e}
          onCerrar={() => {
            setEditando(false);
            void queryClient.invalidateQueries({ queryKey: ["equipos", "detalle", codigo] });
          }}
        />
      )}
      <AlertDialog open={borrando} onOpenChange={setBorrando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el equipo {e.codigo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Si tiene solicitudes o trabajos no se podrá eliminar; en ese caso, cámbialo a “Dado de baja”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => borrar.mutate()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
