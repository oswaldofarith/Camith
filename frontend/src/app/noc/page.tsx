"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ESTADO_ORDEN, SERIES } from "@/components/common/estados";
import { Icons } from "@/components/icons";
import { MapaRutasDelDia } from "@/components/mapa/MapaRutasDelDia";
import { Badge } from "@/components/ui/badge";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";

const REFRESCO = 30_000;

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{format(ahora, "EEEE d 'de' MMMM · HH:mm:ss", { locale: es })}</span>;
}

/** Pantalla para el monitor del centro de operaciones: sin menú, refresco automático. */
export default function NocPage() {
  const router = useRouter();
  const { usuario, cargando, tieneRol } = useSesion();
  useEffect(() => {
    if (!cargando && !usuario) router.replace("/login?next=/noc");
  }, [cargando, usuario, router]);

  const rutas = useQuery({
    queryKey: ["planificacion", "rutas-del-dia"],
    queryFn: () => unwrap(api.GET("/api/planificacion/rutas-del-dia")),
    refetchInterval: REFRESCO,
    enabled: !!usuario,
  });

  if (cargando || !usuario) {
    return <Loader2 className="text-primary m-auto mt-32 size-12 animate-spin" />;
  }
  if (!tieneRol("administrador", "supervisor", "ingenieroDeOficina")) {
    return <p className="p-8 text-center">No tienes acceso a esta pantalla.</p>;
  }

  return (
    <div className="bg-background flex h-svh flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <Icons.logo className="h-7 w-auto" />
        <h1 className="text-lg font-semibold">Centro de operaciones</h1>
        <span className="text-muted-foreground ml-auto text-sm capitalize"><Reloj /></span>
      </header>
      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[1fr_340px]">
        <MapaRutasDelDia className="h-full min-h-96" refresco={REFRESCO} />
        <aside className="min-h-0 space-y-2 overflow-y-auto">
          {(rutas.data?.rutas ?? []).map((r, i) => {
            const total = r.trabajos.length;
            const hechos = r.trabajos.filter((t) => t.estado !== "Pendiente").length;
            return (
              <div key={r.orden_id} className="rounded-md border p-3" style={{ borderLeft: `4px solid ${SERIES[i % SERIES.length]}` }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{r.display_id}</span>
                  <Badge variant={ESTADO_ORDEN[r.estado_general]?.variante}>{ESTADO_ORDEN[r.estado_general]?.etiqueta ?? r.estado_general}</Badge>
                </div>
                <p className="text-muted-foreground text-xs">{r.placas.join(" + ")} · {r.tecnicos.join(", ")}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                    <div className="h-2 rounded-full" style={{ width: `${total ? (hechos * 100) / total : 0}%`, background: "var(--estado-completado)" }} />
                  </div>
                  <span className="text-sm tabular-nums">{hechos}/{total}</span>
                </div>
              </div>
            );
          })}
          {!rutas.isPending && !rutas.data?.rutas.length && (
            <p className="text-muted-foreground p-4 text-center text-sm">No hay órdenes en curso.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
