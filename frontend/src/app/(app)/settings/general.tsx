"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, unwrap } from "@/lib/api/client";
import type { Configuracion } from "@/lib/api/types";

type Campo = { campo: keyof Configuracion; etiqueta: string; tipo?: "time" | "number" };

const EMPRESA: Campo[] = [
  { campo: "empresa_nombre", etiqueta: "Nombre de la empresa" },
  { campo: "empresa_unidad_negocio", etiqueta: "Unidad de negocio" },
  { campo: "empresa_departamento", etiqueta: "Departamento" },
  { campo: "sede_central_nombre", etiqueta: "Nombre de la sede central" },
];
const JORNADA: Campo[] = [
  { campo: "hora_inicio_jornada", etiqueta: "Inicio de jornada", tipo: "time" },
  { campo: "hora_fin_jornada", etiqueta: "Fin de jornada", tipo: "time" },
  { campo: "hora_inicio_almuerzo", etiqueta: "Inicio de almuerzo", tipo: "time" },
  { campo: "hora_fin_almuerzo", etiqueta: "Fin de almuerzo", tipo: "time" },
  { campo: "minutos_almuerzo", etiqueta: "Minutos de almuerzo", tipo: "number" },
  { campo: "minutos_planificacion", etiqueta: "Minutos de planificación", tipo: "number" },
  { campo: "minutos_reporte", etiqueta: "Minutos de reporte", tipo: "number" },
];

export function ConfiguracionGeneral({ inicial }: { inicial: Configuracion }) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState(inicial);
  const [lat, setLat] = useState(inicial.sede_central?.lat?.toString() ?? "");
  const [lng, setLng] = useState(inicial.sede_central?.lng?.toString() ?? "");

  const guardar = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT("/api/catalogos/configuracion", {
          body: {
            ...config,
            // Las horas vacías se envían como null.
            ...Object.fromEntries(JORNADA.filter((c) => c.tipo === "time").map((c) => [c.campo, config[c.campo] || null])),
            sede_central: lat && lng ? { lat: Number(lat), lng: Number(lng) } : null,
          },
        }),
      ),
    onSuccess: () => {
      toast.success("Configuración guardada.");
      void queryClient.invalidateQueries({ queryKey: ["catalogos"] });
    },
  });

  const campo = ({ campo, etiqueta, tipo }: Campo) => (
    <div key={campo} className="space-y-1.5">
      <Label htmlFor={campo}>{etiqueta}</Label>
      <Input
        id={campo}
        type={tipo ?? "text"}
        value={(config[campo] as string | number | null) ?? ""}
        onChange={(e) =>
          setConfig((c) => ({ ...c, [campo]: tipo === "number" ? Number(e.target.value) : e.target.value }))
        }
      />
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Empresa y sede</CardTitle>
            <CardDescription>La sede es el punto de salida y regreso de las rutas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {EMPRESA.map(campo)}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lat">Latitud de la sede</Label>
                <Input id="lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lng">Longitud de la sede</Label>
                <Input id="lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Jornada de trabajo</CardTitle>
            <CardDescription>Se usa para planificar cuántos trabajos caben en cada ruta.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {JORNADA.map(campo)}
            {campo({ campo: "zona_horaria", etiqueta: "Zona horaria" })}
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="animate-spin" />}
              Guardar configuración
            </Button>
          </CardFooter>
        </Card>
      </div>
    </form>
  );
}
