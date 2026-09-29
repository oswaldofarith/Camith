"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Clock, FileText, XCircle } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";

export default function DashboardPage() {
  const { usuario } = useSesion();
  const kpis = useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: () => unwrap(api.GET("/api/dashboard/kpis")),
    refetchInterval: 60_000,
  });

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
            <StatCard
              title="No completados hoy"
              value={kpis.data.trabajos_no_completados_creados_hoy}
              icon={XCircle}
            />
            <StatCard title="Solicitudes pendientes" value={kpis.data.solicitudes_pendientes} icon={FileText} />
          </>
        ) : (
          <p className="text-destructive text-sm">{kpis.error?.message}</p>
        )}
      </div>
    </>
  );
}
