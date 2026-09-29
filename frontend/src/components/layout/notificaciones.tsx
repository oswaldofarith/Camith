"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Bell, Loader2, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, unwrap } from "@/lib/api/client";
import type { Notificacion } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const CLAVE = ["notificaciones", "recientes"] as const;
const INTERVALO_MS = 60_000;

export function MenuNotificaciones() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);

  const conteo = useQuery({
    queryKey: ["notificaciones", "conteo"],
    queryFn: () => unwrap(api.GET("/api/notificaciones/conteo")),
    refetchInterval: INTERVALO_MS,
  });
  const recientes = useQuery({
    queryKey: CLAVE,
    queryFn: () => unwrap(api.GET("/api/notificaciones", { params: { query: { page: 1 } } })),
    enabled: abierto,
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

  const noLeidas = conteo.data?.no_leidas ?? 0;

  function abrir(n: Notificacion) {
    if (!n.leida) leer.mutate(n.id);
    setAbierto(false);
    if (n.entidad_url) router.push(n.entidad_url);
  }

  return (
    <DropdownMenu open={abierto} onOpenChange={setAbierto}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative rounded-full" aria-label="Notificaciones">
          <Bell className="size-5" />
          {noLeidas > 0 && (
            <Badge className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex size-4 min-w-4 items-center justify-center rounded-full p-0 text-[10px]">
              {noLeidas > 9 ? "9+" : noLeidas}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 md:w-96">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {noLeidas > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => leerTodas.mutate()}>
              <MailCheck className="size-3" /> Marcar todas como leídas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-80">
          {recientes.isPending ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !recientes.data?.items.length ? (
            <p className="text-muted-foreground py-4 text-center text-sm">No tienes notificaciones.</p>
          ) : (
            recientes.data.items.slice(0, 10).map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => abrir(n)}
                className={cn("cursor-pointer", !n.leida && "bg-accent/10 font-semibold")}
              >
                <div className="flex w-full flex-col overflow-hidden">
                  <p className="text-xs leading-tight whitespace-normal">{n.mensaje}</p>
                  <span className="text-muted-foreground mt-0.5 text-xs font-normal">
                    {n.creada_por_nombre ? `${n.creada_por_nombre} · ` : ""}
                    {formatDistanceToNow(new Date(n.fecha_creacion), { addSuffix: true, locale: es })}
                  </span>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/notifications")} className="text-primary justify-center">
          Ver todas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
