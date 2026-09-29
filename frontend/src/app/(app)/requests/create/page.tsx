"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { BuscadorEquipo } from "@/components/common/BuscadorEquipo";
import { PageHeader } from "@/components/common/PageHeader";
import { SelectorCatalogo } from "@/components/common/SelectorCatalogo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api/client";
import { useCatalogos } from "@/lib/api/hooks";
import type { Equipo } from "@/lib/api/types";

const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

function FormularioSolicitud() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const [equipoElegido, setEquipo] = useState<Equipo | null>(null);
  const [tipoTrabajo, setTipoTrabajo] = useState("");
  const [urgencia, setUrgencia] = useState("normal");
  const [fecha, setFecha] = useState(manana);
  const [minutos, setMinutos] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // Si se llega desde la ficha de un equipo (?equipo=CODIGO), se precarga.
  const codigoInicial = params.get("equipo");
  const precargado = useQuery({
    queryKey: ["equipos", "detalle", codigoInicial],
    queryFn: () => unwrap(api.GET("/api/equipos/{codigo}", { params: { path: { codigo: codigoInicial! } } })),
    enabled: !!codigoInicial,
  });
  const equipo = equipoElegido ?? precargado.data ?? null;

  const pendientes = useQuery({
    queryKey: ["solicitudes", "pendientes-equipo", equipo?.codigo],
    queryFn: () =>
      unwrap(api.GET("/api/solicitudes", { params: { query: { equipo: equipo!.codigo, estado: ["pendiente", "asignada"] } } })),
    enabled: !!equipo,
  });

  const tipos = catalogos.data?.tipos_equipo.find((t) => t.valor === equipo?.tipo)?.tipos_trabajo.filter((t) => t.activo) ?? [];
  const tipoElegido = tipos.find((t) => String(t.id) === tipoTrabajo);

  const crear = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/solicitudes", {
          body: {
            equipo: equipo!.codigo,
            tipo_trabajo_id: Number(tipoTrabajo),
            urgencia,
            fecha_programada: fecha,
            tiempo_servicio_estimado: minutos ? Number(minutos) : null,
            descripcion: descripcion.trim(),
          },
        }),
      ),
    onSuccess: (s) => {
      toast.success(`Solicitud ${s.display_id} creada. Se notificó a los supervisores.`);
      void queryClient.invalidateQueries({ queryKey: ["solicitudes"] });
      router.push("/requests");
    },
  });

  return (
    <Card className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="equipo">Equipo</Label>
            <BuscadorEquipo
              id="equipo"
              valor={equipo}
              onCambiar={(e) => {
                setEquipo(e);
                setTipoTrabajo("");
              }}
            />
          </div>
          {!!pendientes.data?.count && (
            <Alert>
              <AlertTriangle />
              <AlertDescription>
                Este equipo ya tiene {pendientes.data.count} solicitud(es) abiertas:{" "}
                {pendientes.data.items.map((s) => s.display_id).join(", ")}.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tipo-trabajo">Tipo de trabajo</Label>
              <Select value={tipoTrabajo} onValueChange={setTipoTrabajo} disabled={!equipo}>
                <SelectTrigger id="tipo-trabajo">
                  <SelectValue placeholder={equipo ? "Elige el trabajo" : "Primero elige un equipo"} />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.nombre} ({t.tiempo_estimado_minutos} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {equipo && !tipos.length && (
                <p className="text-destructive text-xs">Este tipo de equipo no tiene tipos de trabajo configurados.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="urgencia">Urgencia</Label>
              <SelectorCatalogo id="urgencia" items={catalogos.data?.urgencias} valor={urgencia} onCambiar={setUrgencia} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Fecha programada</Label>
              <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minutos">Tiempo estimado (min)</Label>
              <Input
                id="minutos"
                type="number"
                min={1}
                placeholder={tipoElegido ? String(tipoElegido.tiempo_estimado_minutos) : ""}
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea id="descripcion" rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/requests">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={!equipo || !tipoTrabajo || !fecha || crear.isPending}>
            {crear.isPending && <Loader2 className="animate-spin" />}
            Crear solicitud
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function CrearSolicitudPage() {
  return (
    <>
      <PageHeader title="Nueva solicitud" description="Pide un trabajo sobre un equipo; los supervisores la asignarán a una orden." />
      <Suspense>
        <FormularioSolicitud />
      </Suspense>
    </>
  );
}
