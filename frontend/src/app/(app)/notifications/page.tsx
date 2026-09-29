"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Paginacion } from "@/components/common/Paginacion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export default function NotificacionesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);

  const lista = useQuery({
    queryKey: ["notificaciones", "lista", pagina, soloNoLeidas],
    queryFn: () =>
      unwrap(api.GET("/api/notificaciones", { params: { query: { page: pagina, no_leidas: soloNoLeidas } } })),
    placeholderData: (previo) => previo,
  });
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["notificaciones"] });
  const leer = useMutation({
    mutationFn: (id: number) =>
      unwrap(api.POST("/api/notificaciones/{notificacion_id}/leer", { params: { path: { notificacion_id: id } } })),
    onSettled: invalidar,
  });
  const leerTodas = useMutation({
    mutationFn: () => unwrap(api.POST("/api/notificaciones/leer-todas")),
    onSettled: invalidar,
  });

  return (
    <>
      <PageHeader title="Notificaciones">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={soloNoLeidas}
            onCheckedChange={(v) => {
              setSoloNoLeidas(v);
              setPagina(1);
            }}
          />
          Solo no leídas
        </label>
        <Button variant="outline" onClick={() => leerTodas.mutate()} disabled={leerTodas.isPending}>
          <MailCheck /> Marcar todas como leídas
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          {lista.isPending ? (
            <Cargando />
          ) : lista.isError ? (
            <ErrorCarga error={lista.error} />
          ) : !lista.data.items.length ? (
            <Vacio texto="No hay notificaciones." />
          ) : (
            <ul className="divide-y">
              {lista.data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      "hover:bg-muted/60 flex w-full items-start gap-3 px-4 py-3 text-left",
                      !n.leida && "bg-accent/5",
                    )}
                    onClick={() => {
                      if (!n.leida) leer.mutate(n.id);
                      if (n.entidad_url) router.push(n.entidad_url);
                    }}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.leida ? "bg-transparent" : "bg-accent")} />
                    <span className="flex-1">
                      <span className={cn("block text-sm", !n.leida && "font-semibold")}>{n.mensaje}</span>
                      <span className="text-muted-foreground text-xs">
                        {n.creada_por_nombre ? `${n.creada_por_nombre} · ` : ""}
                        {format(new Date(n.fecha_creacion), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {lista.data && <Paginacion pagina={pagina} total={lista.data.count} porPagina={30} onCambiar={setPagina} />}
    </>
  );
}
