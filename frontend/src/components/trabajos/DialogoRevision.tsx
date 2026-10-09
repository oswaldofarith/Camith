"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api/client";
import type { Trabajo } from "@/lib/api/types";

type EstadoRevision = "Pendiente" | "Completado" | "No Completado";

/** Revisión del ingeniero o supervisor: estado, observación y nueva revisión. */
export function DialogoRevision({ trabajo, onCerrar }: { trabajo: Trabajo; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState(trabajo.estado as EstadoRevision);
  const [observacion, setObservacion] = useState(trabajo.observacion_ingeniero);
  const [requiere, setRequiere] = useState(trabajo.requiere_nueva_revision);
  const [fecha, setFecha] = useState(trabajo.fecha_nueva_revision ?? "");

  const guardar = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/trabajos/{trabajo_id}/revisar", {
          params: { path: { trabajo_id: trabajo.id } },
          body: {
            ...(estado !== trabajo.estado && { estado }),
            ...(observacion !== trabajo.observacion_ingeniero && { observacion }),
            requiere_nueva_revision: requiere,
            fecha_nueva_revision: requiere && fecha ? fecha : null,
          },
        }),
      ),
    onSuccess: () => {
      toast.success(`Trabajo ${trabajo.codigo} revisado.`);
      void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      void queryClient.invalidateQueries({ queryKey: ["trabajos"] });
      onCerrar();
    },
  });

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revisar {trabajo.codigo}</DialogTitle>
          <DialogDescription>
            Equipo {trabajo.equipo.codigo} · {trabajo.tipo_trabajo_nombre}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rev-estado">Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoRevision)}>
              <SelectTrigger id="rev-estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pendiente">Pendiente (reabrir)</SelectItem>
                <SelectItem value="Completado">Completado</SelectItem>
                <SelectItem value="No Completado">No completado</SelectItem>
              </SelectContent>
            </Select>
            {estado === "Pendiente" && trabajo.estado !== "Pendiente" && (
              <p className="text-muted-foreground text-xs">Se borrará quién lo completó y la observación actual.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rev-obs">Observación del ingeniero</Label>
            <Textarea id="rev-obs" rows={3} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={requiere} onCheckedChange={(v) => setRequiere(v === true)} /> Requiere nueva revisión
          </label>
          {requiere && (
            <div className="space-y-1.5">
              <Label htmlFor="rev-fecha">Fecha sugerida</Label>
              <Input id="rev-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar revisión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
