"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  abierto: boolean;
  onCambiar: (abierto: boolean) => void;
  titulo: string;
  descripcion?: React.ReactNode;
  textoConfirmar: string;
  destructivo?: boolean;
  sugerencias?: string[];
  onConfirmar: (motivo: string) => Promise<unknown>;
};

/** Confirmación que exige un motivo (desactivar, cancelar...). */
export function DialogoMotivo({
  abierto,
  onCambiar,
  titulo,
  descripcion,
  textoConfirmar,
  destructivo,
  sugerencias,
  onConfirmar,
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    try {
      await onConfirmar(motivo.trim());
      setMotivo("");
      onCambiar(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo (obligatorio)</Label>
          <Textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          {!!sugerencias?.length && (
            <div className="flex flex-wrap gap-1">
              {sugerencias.map((s) => (
                <Button key={s} type="button" size="sm" variant="outline" onClick={() => setMotivo(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambiar(false)} disabled={enviando}>
            Volver
          </Button>
          <Button
            variant={destructivo ? "destructive" : "default"}
            onClick={confirmar}
            disabled={!motivo.trim() || enviando}
          >
            {enviando && <Loader2 className="animate-spin" />}
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
