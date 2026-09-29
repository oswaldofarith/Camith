"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, unwrap } from "@/lib/api/client";
import type { Catalogos, ItemCatalogo } from "@/lib/api/types";

const CATALOGOS = [
  { ruta: "marcas", clave: "marcas", titulo: "Marcas de equipos" },
  { ruta: "zonas", clave: "zonas", titulo: "Zonas" },
  { ruta: "tipos-equipo", clave: "tipos_equipo", titulo: "Tipos de equipo" },
  { ruta: "estados-equipo", clave: "estados_equipo", titulo: "Estados de equipo" },
  { ruta: "tipos-vehiculo", clave: "tipos_vehiculo", titulo: "Tipos de vehículo" },
  { ruta: "estados-vehiculo", clave: "estados_vehiculo", titulo: "Estados de vehículo" },
  { ruta: "urgencias", clave: "urgencias", titulo: "Urgencias" },
  { ruta: "respuestas-predefinidas", clave: "respuestas_predefinidas", titulo: "Respuestas predefinidas" },
] as const;

type Ruta = (typeof CATALOGOS)[number]["ruta"];

/** "Vía a la Costa" → "via-a-la-costa" (identificador estable). */
function aValor(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function TarjetaCatalogo({ ruta, titulo, items }: { ruta: Ruta; titulo: string; items: ItemCatalogo[] }) {
  const queryClient = useQueryClient();
  const [nuevo, setNuevo] = useState("");
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["catalogos"] });
  const path = { params: { path: { catalogo: ruta } } };

  const crear = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/catalogos/{catalogo}", {
          ...path,
          body: { valor: aValor(nuevo), etiqueta: nuevo.trim(), activo: true, orden: items.length },
        }),
      ),
    onSuccess: () => {
      setNuevo("");
      void refrescar();
    },
  });
  const cambiarActivo = useMutation({
    mutationFn: (i: ItemCatalogo) =>
      unwrap(
        api.PATCH("/api/catalogos/{catalogo}/{valor}", {
          params: { path: { catalogo: ruta, valor: i.valor } },
          body: { activo: !i.activo },
        }),
      ),
    onSettled: refrescar,
  });
  const borrar = useMutation({
    mutationFn: (i: ItemCatalogo) =>
      unwrap(api.DELETE("/api/catalogos/{catalogo}/{valor}", { params: { path: { catalogo: ruta, valor: i.valor } } })),
    onSuccess: () => void refrescar(),
    onError: (e) => toast.error(`${e.message} Puedes desactivarlo en su lugar.`),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="divide-y text-sm">
          {items.map((i) => (
            <li key={i.valor} className="flex items-center gap-2 py-1.5">
              <span className={i.activo ? "flex-1" : "text-muted-foreground flex-1 line-through"}>{i.etiqueta}</span>
              <Switch
                checked={i.activo}
                onCheckedChange={() => cambiarActivo.mutate(i)}
                aria-label={`${i.activo ? "Desactivar" : "Activar"} ${i.etiqueta}`}
              />
              <Button variant="ghost" size="icon" onClick={() => borrar.mutate(i)} aria-label={`Eliminar ${i.etiqueta}`}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (aValor(nuevo)) crear.mutate();
          }}
        >
          <Input placeholder="Nuevo valor" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          <Button type="submit" size="icon" variant="outline" disabled={!aValor(nuevo) || crear.isPending} aria-label="Añadir">
            <Plus />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function EditorCatalogos({ catalogos }: { catalogos: Catalogos }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {CATALOGOS.map((c) => (
        <TarjetaCatalogo key={c.ruta} ruta={c.ruta} titulo={c.titulo} items={catalogos[c.clave]} />
      ))}
    </div>
  );
}
