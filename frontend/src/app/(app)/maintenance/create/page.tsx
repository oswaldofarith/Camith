"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, Loader2, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { useCatalogos } from "@/lib/api/hooks";

import { CAMPOS_EXCLUSION } from "../estados";

type Exclusion = components["schemas"]["ExclusionIn"];
type Campo = Exclusion["campo"];

export default function CrearPlanPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const [nombre, setNombre] = useState("");
  const [dias, setDias] = useState("20");
  const [inicio, setInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [exclusiones, setExclusiones] = useState<Exclusion[]>([]);

  const opciones = (campo: Campo) =>
    campo === "zonaPeligrosa"
      ? [{ valor: "true", etiqueta: "Sí" }, { valor: "false", etiqueta: "No" }]
      : ({ tipo: catalogos.data?.tipos_equipo, marca: catalogos.data?.marcas, zona: catalogos.data?.zonas }[campo] ?? []);

  const cuerpo = () => ({
    nombre: nombre.trim(),
    tiempo_de_ejecucion_dias: Number(dias),
    fecha_inicio: inicio || null,
    exclusiones: exclusiones.map((e) => (e.campo === "zonaPeligrosa" ? { ...e, valor: e.valor === "true" } : e)),
  });

  const previa = useMutation({
    mutationFn: () => unwrap(api.POST("/api/planes-mantenimiento/previsualizar", { body: cuerpo() })),
  });
  const crear = useMutation({
    mutationFn: () => unwrap(api.POST("/api/planes-mantenimiento/generar", { body: cuerpo() })),
    onSuccess: (plan) => {
      toast.success(`Plan “${plan.nombre}” creado con ${plan.calendario.length} mantenimientos.`);
      void queryClient.invalidateQueries({ queryKey: ["planes"] });
      router.push(`/maintenance/${plan.id}`);
    },
  });
  const cambiar = (i: number, cambio: Partial<Exclusion>) => {
    setExclusiones((ex) => ex.map((e, j) => (j === i ? { ...e, ...cambio } : e)));
    previa.reset();
  };
  const valido = nombre.trim() && Number(dias) > 0;

  return (
    <>
      <PageHeader
        title="Nuevo plan de mantenimiento"
        description="Se priorizan los equipos nunca revisados, luego la revisión más antigua, la fabricación más antigua y el mayor número de revisiones."
      />
      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Parámetros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre del plan</Label>
              <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Plan preventivo Q4 2026" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dias">Días hábiles</Label>
                <Input id="dias" type="number" min={1} value={dias} onChange={(e) => { setDias(e.target.value); previa.reset(); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inicio">Inicio</Label>
                <Input id="inicio" type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); previa.reset(); }} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Excluir equipos</Label>
              {exclusiones.map((e, i) => (
                <div key={i} className="flex gap-1">
                  <Select value={e.campo} onValueChange={(campo) => cambiar(i, { campo: campo as Campo, valor: "" })}>
                    <SelectTrigger className="w-32" aria-label="Campo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CAMPOS_EXCLUSION).map(([v, et]) => <SelectItem key={v} value={v}>{et}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={e.operador} onValueChange={(operador) => cambiar(i, { operador: operador as Exclusion["operador"] })}>
                    <SelectTrigger className="w-24" aria-label="Operador"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">es</SelectItem>
                      <SelectItem value="no_es">no es</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={String(e.valor)} onValueChange={(valor) => cambiar(i, { valor })}>
                    <SelectTrigger className="flex-1" aria-label="Valor"><SelectValue placeholder="Valor" /></SelectTrigger>
                    <SelectContent>
                      {opciones(e.campo).map((o) => <SelectItem key={o.valor} value={o.valor}>{o.etiqueta}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => { setExclusiones((ex) => ex.filter((_, j) => j !== i)); previa.reset(); }} aria-label="Quitar exclusión">
                    <X />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setExclusiones((ex) => [...ex, { campo: "zona", operador: "es", valor: "" }])}>
                <Plus /> Añadir exclusión
              </Button>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="outline" onClick={() => previa.mutate()} disabled={!valido || previa.isPending}>
              {previa.isPending ? <Loader2 className="animate-spin" /> : <Eye />} Previsualizar
            </Button>
            <Button onClick={() => crear.mutate()} disabled={!valido || crear.isPending}>
              {crear.isPending ? <Loader2 className="animate-spin" /> : <Save />} Crear plan
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calendario</CardTitle>
            <CardDescription>
              {previa.data
                ? `${previa.data.total_equipos_considerados} equipos programados · ${previa.data.total_equipos_excluidos} excluidos (inactivos o por exclusión)`
                : "Pulsa “Previsualizar” para ver el calendario antes de crearlo."}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[65svh] overflow-y-auto p-0">
            {previa.data && !previa.data.calendario.length && (
              <Alert className="m-4"><AlertDescription>Ningún equipo cumple los criterios.</AlertDescription></Alert>
            )}
            {!!previa.data?.calendario.length && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Motivo de prioridad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.data.calendario.map((p) => (
                    <TableRow key={p.equipo}>
                      <TableCell className="whitespace-nowrap">{format(new Date(`${p.fecha_programada}T12:00`), "EEE dd/MM")}</TableCell>
                      <TableCell className="font-medium">{p.equipo}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{p.motivo_prioridad}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
