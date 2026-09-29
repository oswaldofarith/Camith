"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, unwrap } from "@/lib/api/client";
import { etiqueta, useCatalogos, useUsuarios } from "@/lib/api/hooks";

const IMAGENES: Record<string, string> = {
  camionetaCabinaSimple: "/images/camionetaCabinaSimple.webp",
  camionetaCabinaDoble: "/images/camionetaCabinaDoble.webp",
  camionCanasta: "/images/camionCanasta.webp",
};

type Composicion = Record<string, number[]>; // código de vehículo → técnicos

export default function UnidadesCampoPage() {
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const tecnicos = useUsuarios({ rol: "tecnicoDeCampo", activo: true });
  const vehiculos = useQuery({
    queryKey: ["vehiculos", "disponible"],
    queryFn: () => unwrap(api.GET("/api/vehiculos", { params: { query: { estado: "disponible" } } })),
  });
  const guardadas = useQuery({
    queryKey: ["unidades-campo"],
    queryFn: () => unwrap(api.GET("/api/unidades-campo")),
  });

  // Borrador de cambios sin guardar; mientras sea null se muestra lo del servidor.
  const [borrador, setBorrador] = useState<Composicion | null>(null);
  const composicion = useMemo<Composicion>(
    () => borrador ?? Object.fromEntries((guardadas.data ?? []).map((u) => [u.vehiculo, u.tecnicos])),
    [borrador, guardadas.data],
  );
  const cambios = borrador !== null;

  const asignados = useMemo(() => new Set(Object.values(composicion).flat()), [composicion]);
  const libres = (tecnicos.data ?? []).filter((t) => !asignados.has(t.id));
  const nombre = (id: number) => tecnicos.data?.find((t) => t.id === id);

  const modificar = (vehiculo: string, lista: number[]) =>
    setBorrador({ ...composicion, [vehiculo]: lista });

  const guardar = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT("/api/unidades-campo", {
          body: Object.entries(composicion)
            .filter(([, t]) => t.length)
            .map(([vehiculo, t]) => ({ vehiculo, tecnicos: t })),
        }),
      ),
    onSuccess: () => {
      toast.success("Unidades de campo guardadas.");
      void queryClient.invalidateQueries({ queryKey: ["unidades-campo"] }).then(() => setBorrador(null));
    },
  });

  const cargando = vehiculos.isPending || tecnicos.isPending || guardadas.isPending;
  const error = vehiculos.error ?? tecnicos.error ?? guardadas.error;

  return (
    <>
      <PageHeader
        title="Unidades de campo"
        description="Composición habitual de cada cuadrilla; se usa como punto de partida al planificar."
      >
        <Badge variant="secondary">{libres.length} técnicos sin unidad</Badge>
        <Button onClick={() => guardar.mutate()} disabled={!cambios || guardar.isPending}>
          {guardar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Guardar
        </Button>
      </PageHeader>
      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorCarga error={error} />
      ) : !vehiculos.data?.length ? (
        <Vacio texto="No hay vehículos disponibles." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehiculos.data.map((v) => {
            const lista = composicion[v.codigo] ?? [];
            return (
              <Card key={v.codigo}>
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  {IMAGENES[v.tipo] && <Image src={IMAGENES[v.tipo]} alt="" width={64} height={36} className="h-9 w-auto" />}
                  <div>
                    <CardTitle className="text-base">{v.placa}</CardTitle>
                    <p className="text-muted-foreground text-xs">
                      Unidad {v.codigo} · {etiqueta(catalogos.data?.tipos_vehiculo, v.tipo)}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1">
                    {lista.map((id) => (
                      <li key={id} className="bg-muted flex items-center justify-between rounded-md px-2 py-1 text-sm">
                        <span>
                          {nombre(id)?.nombre ?? `Usuario ${id}`}
                          {!!nombre(id)?.habilidades.length && (
                            <span className="text-muted-foreground ml-1 text-xs">({nombre(id)!.habilidades.join(", ")})</span>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => modificar(v.codigo, lista.filter((t) => t !== id))}
                          aria-label={`Quitar a ${nombre(id)?.nombre} de ${v.placa}`}
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    ))}
                    {!lista.length && <li className="text-muted-foreground text-sm">Sin técnicos asignados.</li>}
                  </ul>
                  <Select value="" onValueChange={(id) => modificar(v.codigo, [...lista, Number(id)])} disabled={!libres.length}>
                    <SelectTrigger aria-label={`Añadir técnico a ${v.placa}`}>
                      <SelectValue placeholder="Añadir técnico" />
                    </SelectTrigger>
                    <SelectContent>
                      {libres.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
