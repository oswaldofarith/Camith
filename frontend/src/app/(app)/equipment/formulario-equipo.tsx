"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SelectorCatalogo } from "@/components/common/SelectorCatalogo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, unwrap } from "@/lib/api/client";
import { useCatalogos } from "@/lib/api/hooks";
import type { Equipo } from "@/lib/api/types";

type Datos = {
  codigo: string;
  tipo: string;
  marca: string;
  zona: string;
  estado: string;
  motivo_estado: string;
  direccion: string;
  lat: string;
  lng: string;
  ip: string;
  tipo_comunicacion: string;
  piloto: string;
  fecha_fabricacion: string;
  requiere_canasta: boolean;
  zona_peligrosa: boolean;
  proximo_mantenimiento_programado: string;
  intervalo_mantenimiento_dias: string;
  intervalo_mantenimiento_revisiones: string;
};

const desde = (e: Equipo | null): Datos => ({
  codigo: e?.codigo ?? "",
  tipo: e?.tipo ?? "",
  marca: e?.marca ?? "",
  zona: e?.zona ?? "",
  estado: e?.estado ?? "activo",
  motivo_estado: "",
  direccion: e?.direccion ?? "",
  lat: e?.lat?.toString() ?? "",
  lng: e?.lng?.toString() ?? "",
  ip: e?.ip ?? "",
  tipo_comunicacion: e?.tipo_comunicacion ?? "Celular",
  piloto: e?.piloto ?? "",
  fecha_fabricacion: e?.fecha_fabricacion ?? "",
  requiere_canasta: e?.requiere_canasta ?? false,
  zona_peligrosa: e?.zona_peligrosa ?? false,
  proximo_mantenimiento_programado: e?.proximo_mantenimiento_programado ?? "",
  intervalo_mantenimiento_dias: e?.intervalo_mantenimiento_dias?.toString() ?? "365",
  intervalo_mantenimiento_revisiones: e?.intervalo_mantenimiento_revisiones?.toString() ?? "",
});

const numeroONulo = (v: string) => (v.trim() === "" ? null : Number(v));

export function FormularioEquipo({ equipo, onCerrar }: { equipo: Equipo | null; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const [d, setD] = useState<Datos>(() => desde(equipo));
  const set = <K extends keyof Datos>(k: K, v: Datos[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const cambiaEstado = !!equipo && d.estado !== equipo.estado;

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        tipo: d.tipo,
        marca: d.marca,
        zona: d.zona,
        estado: d.estado,
        motivo_estado: d.motivo_estado,
        direccion: d.direccion,
        lat: Number(d.lat),
        lng: Number(d.lng),
        ip: d.ip.trim() || null,
        tipo_comunicacion: d.tipo_comunicacion,
        piloto: d.piloto,
        fecha_fabricacion: d.fecha_fabricacion || null,
        requiere_canasta: d.requiere_canasta,
        zona_peligrosa: d.zona_peligrosa,
        proximo_mantenimiento_programado: d.proximo_mantenimiento_programado || null,
        intervalo_mantenimiento_dias: numeroONulo(d.intervalo_mantenimiento_dias),
        intervalo_mantenimiento_revisiones: numeroONulo(d.intervalo_mantenimiento_revisiones),
      };
      return equipo
        ? unwrap(api.PATCH("/api/equipos/{codigo}", { params: { path: { codigo: equipo.codigo } }, body: cuerpo }))
        : unwrap(api.POST("/api/equipos", { body: { ...cuerpo, codigo: d.codigo.trim(), campos_adicionales: {}, revision_count: 0 } }));
    },
    onSuccess: (e) => {
      toast.success(`Equipo ${e.codigo} guardado.`);
      void queryClient.invalidateQueries({ queryKey: ["equipos"] });
      onCerrar();
    },
    onError: (e) => toast.error(e.message),
  });

  const texto = (k: keyof Datos, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{etiqueta}</Label>
      <Input id={k} value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </div>
  );
  const catalogo = (k: "tipo" | "marca" | "zona" | "estado", etiqueta: string, items: Parameters<typeof SelectorCatalogo>[0]["items"]) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{etiqueta}</Label>
      <SelectorCatalogo id={k} items={items} valor={d[k]} onCambiar={(v) => set(k, v)} placeholder={etiqueta} />
    </div>
  );
  const completo =
    d.codigo.trim() && d.tipo && d.marca && d.zona && d.estado && d.direccion.trim() && d.lat && d.lng && (!cambiaEstado || d.motivo_estado.trim());

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{equipo ? `Editar equipo ${equipo.codigo}` : "Nuevo equipo"}</DialogTitle>
        </DialogHeader>
        <form
          id="form-equipo"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          {texto("codigo", "Identificación", { disabled: !!equipo })}
          {catalogo("tipo", "Tipo", catalogos.data?.tipos_equipo)}
          {catalogo("marca", "Marca", catalogos.data?.marcas)}
          {catalogo("zona", "Zona", catalogos.data?.zonas)}
          {catalogo("estado", "Estado", catalogos.data?.estados_equipo)}
          {cambiaEstado ? texto("motivo_estado", "Motivo del cambio de estado") : <div className="hidden sm:block" />}
          <div className="sm:col-span-2">{texto("direccion", "Dirección")}</div>
          {texto("lat", "Latitud", { type: "number", step: "any" })}
          {texto("lng", "Longitud", { type: "number", step: "any" })}
          <div className="space-y-1.5">
            <Label htmlFor="tipo_comunicacion">Tipo de comunicación</Label>
            <Select value={d.tipo_comunicacion} onValueChange={(v) => set("tipo_comunicacion", v)}>
              <SelectTrigger id="tipo_comunicacion"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Celular">Celular</SelectItem>
                <SelectItem value="Fibra óptica">Fibra óptica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {texto("ip", "IP")}
          {texto("piloto", "Piloto")}
          {texto("fecha_fabricacion", "Fecha de fabricación", { type: "date" })}
          {texto("proximo_mantenimiento_programado", "Próximo mantenimiento", { type: "date" })}
          {texto("intervalo_mantenimiento_dias", "Intervalo de mantenimiento (días)", { type: "number", min: 1 })}
          {texto("intervalo_mantenimiento_revisiones", "Intervalo de mantenimiento (revisiones)", { type: "number", min: 1 })}
          <div className="flex items-center gap-6 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={d.requiere_canasta} onCheckedChange={(v) => set("requiere_canasta", v === true)} /> Requiere canasta
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={d.zona_peligrosa} onCheckedChange={(v) => set("zona_peligrosa", v === true)} /> Zona peligrosa
            </label>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-equipo" disabled={!completo || guardar.isPending}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
