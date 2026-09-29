"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, ClipboardList, Clock, FileText, XCircle } from "lucide-react";
import Link from "next/link";

import { Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { OrdenesPorDia, ProgresoDelDia, TrabajosPorDia } from "@/components/dashboard/graficos";
import { MapaRutasDelDia } from "@/components/mapa/MapaRutasDelDia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";

const REFRESCO = 60_000;

export default function DashboardPage() {
  const { usuario, tieneRol } = useSesion();
  const verOperacion = tieneRol("administrador", "supervisor", "ingenieroDeOficina");
  const kpis = useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: () => unwrap(api.GET("/api/dashboard/kpis")),
    refetchInterval: REFRESCO,
  });
  const tendencias = useQuery({
    queryKey: ["dashboard", "tendencias"],
    queryFn: () => unwrap(api.GET("/api/dashboard/tendencias", { params: { query: { dias: 14 } } })),
    refetchInterval: REFRESCO,
  });
  const pendientes = useQuery({
    queryKey: ["trabajos", "dashboard-pendientes"],
    queryFn: () => unwrap(api.GET("/api/trabajos", { params: { query: { estado: ["Pendiente"], page: 1 } } })),
    refetchInterval: REFRESCO,
    enabled: verOperacion,
  });
  const sinAsignar = useQuery({
    queryKey: ["solicitudes", "dashboard-sin-asignar"],
    queryFn: () => unwrap(api.GET("/api/solicitudes", { params: { query: { estado: ["pendiente"], page: 1 } } })),
    refetchInterval: REFRESCO,
    enabled: verOperacion,
  });
  const hoy = tendencias.data?.at(-1);

  return (
    <>
      <PageHeader title="Dashboard" description={`Hola, ${usuario?.nombre ?? ""}.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.isPending ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : kpis.data ? (
          <>
            <StatCard title="Órdenes del día" value={kpis.data.ordenes_del_dia} icon={ClipboardList} />
            <StatCard
              title="Trabajos pendientes"
              value={kpis.data.trabajos_pendientes_total}
              description={`${kpis.data.trabajos_pendientes_creados_hoy} de órdenes de hoy`}
              icon={Clock}
            />
            <StatCard title="Completados hoy" value={kpis.data.trabajos_completados_hoy} icon={CheckCircle2} />
            <StatCard title="No completados hoy" value={kpis.data.trabajos_no_completados_creados_hoy} icon={XCircle} />
            <StatCard title="Solicitudes pendientes" value={kpis.data.solicitudes_pendientes} icon={FileText} />
          </>
        ) : (
          <p className="text-destructive text-sm">{kpis.error?.message}</p>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {verOperacion && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Mapa de operaciones</CardTitle>
              <CardDescription>Órdenes de hoy y las que aún tienen trabajos pendientes.</CardDescription>
            </CardHeader>
            <CardContent>
              <MapaRutasDelDia className="h-[28rem]" />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Progreso del día</CardTitle>
            <CardDescription>Trabajos de las órdenes creadas hoy.</CardDescription>
          </CardHeader>
          <CardContent>{tendencias.isPending ? <Skeleton className="h-32" /> : <ProgresoDelDia dia={hoy} />}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Trabajos por día</CardTitle>
            <CardDescription>Últimos 14 días, según la fecha de su orden.</CardDescription>
          </CardHeader>
          <CardContent>{tendencias.data ? <TrabajosPorDia datos={tendencias.data} /> : <Skeleton className="h-64" />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Órdenes creadas</CardTitle>
            <CardDescription>Últimos 14 días.</CardDescription>
          </CardHeader>
          <CardContent>{tendencias.data ? <OrdenesPorDia datos={tendencias.data} /> : <Skeleton className="h-64" />}</CardContent>
        </Card>

        {verOperacion && (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Trabajos pendientes</CardTitle>
                <Badge variant="secondary">{pendientes.data?.count ?? 0}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {!pendientes.data?.items.length ? (
                  <Vacio texto="No hay trabajos pendientes." />
                ) : (
                  pendientes.data.items.slice(0, 6).map((t) => (
                    <Link key={t.id} href={`/work-orders/${t.orden_id}`} className="hover:bg-muted block rounded-md border p-2 text-sm">
                      <span className="font-medium">{t.equipo.codigo}</span> · {t.tipo_trabajo_nombre}
                      <span className="text-muted-foreground block text-xs">{t.orden_display_id}</span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Solicitudes sin asignar</CardTitle>
                <Badge variant="secondary">{sinAsignar.data?.count ?? 0}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {!sinAsignar.data?.items.length ? (
                  <Vacio texto="Todas las solicitudes están asignadas." />
                ) : (
                  sinAsignar.data.items.slice(0, 6).map((s) => (
                    <div key={s.id} className="rounded-md border p-2 text-sm">
                      <span className="font-medium">{s.display_id}</span> · {s.equipo}
                      {s.urgencia === "urgente" && <Badge variant="destructive" className="ml-2">Urgente</Badge>}
                      <span className="text-muted-foreground block text-xs">
                        {s.tipo_trabajo_nombre} · {format(new Date(`${s.fecha_programada}T12:00`), "dd/MM")}
                      </span>
                    </div>
                  ))
                )}
                {tieneRol("supervisor", "administrador") && !!sinAsignar.data?.count && (
                  <Button asChild size="sm" className="w-full">
                    <Link href="/work-orders/create">Crear orden</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
