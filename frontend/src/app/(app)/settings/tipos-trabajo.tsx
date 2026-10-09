"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, unwrap } from "@/lib/api/client";
import type { Catalogos, TipoTrabajo } from "@/lib/api/types";

function FilaTipo({ tipo, onCambio }: { tipo: TipoTrabajo; onCambio: () => void }) {
  const [minutos, setMinutos] = useState(tipo.tiempo_estimado_minutos);
  const guardar = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH("/api/catalogos/tipos-trabajo/{tipo_id}", {
          params: { path: { tipo_id: tipo.id } },
          body: { tiempo_estimado_minutos: minutos },
        }),
      ),
    onSettled: onCambio,
  });
  const borrar = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/catalogos/tipos-trabajo/{tipo_id}", { params: { path: { tipo_id: tipo.id } } })),
    onSettled: onCambio,
  });
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className="flex-1">{tipo.nombre}</span>
      <Input
        type="number"
        min={1}
        className="h-8 w-20"
        value={minutos}
        onChange={(e) => setMinutos(Number(e.target.value))}
        onBlur={() => minutos !== tipo.tiempo_estimado_minutos && guardar.mutate()}
        aria-label={`Minutos de ${tipo.nombre}`}
      />
      <span className="text-muted-foreground w-8 text-xs">min</span>
      <Button variant="ghost" size="icon" onClick={() => borrar.mutate()} aria-label={`Eliminar ${tipo.nombre}`}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

export function EditorTiposTrabajo({ catalogos }: { catalogos: Catalogos }) {
  const queryClient = useQueryClient();
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["catalogos"] });
  const [nuevos, setNuevos] = useState<Record<string, string>>({});
  const crear = useMutation({
    mutationFn: (tipoEquipo: string) =>
      unwrap(
        api.POST("/api/catalogos/tipos-trabajo", {
          body: { tipo_equipo: tipoEquipo, nombre: nuevos[tipoEquipo].trim(), tiempo_estimado_minutos: 30, activo: true },
        }),
      ),
    onSuccess: (_d, tipoEquipo) => {
      setNuevos((n) => ({ ...n, [tipoEquipo]: "" }));
      refrescar();
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {catalogos.tipos_equipo.map((te) => (
        <Card key={te.valor}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{te.etiqueta}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="divide-y">
              {te.tipos_trabajo.map((t) => (
                <FilaTipo key={t.id} tipo={t} onCambio={refrescar} />
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (nuevos[te.valor]?.trim()) crear.mutate(te.valor);
              }}
            >
              <Input
                placeholder="Nuevo tipo de trabajo"
                value={nuevos[te.valor] ?? ""}
                onChange={(e) => setNuevos((n) => ({ ...n, [te.valor]: e.target.value }))}
              />
              <Button type="submit" size="icon" variant="outline" aria-label="Añadir tipo de trabajo">
                <Plus />
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
