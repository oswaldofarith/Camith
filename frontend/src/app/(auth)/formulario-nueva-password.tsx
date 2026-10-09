"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { CampoPassword } from "./campo-password";

type Props = {
  titulo: string;
  descripcion: string;
  pedirActual?: boolean;
  onGuardar: (nueva: string, actual: string) => Promise<void>;
};

/** Formulario de contraseña nueva + confirmación (y opcionalmente la actual). */
export function FormularioNuevaPassword({ titulo, descripcion, pedirActual, onGuardar }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const nueva = String(datos.get("nueva"));
    if (nueva !== datos.get("confirmacion")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await onGuardar(nueva, String(datos.get("actual") ?? ""));
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <p className="text-muted-foreground text-sm">{descripcion}</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {pedirActual && (
        <div className="space-y-2">
          <Label htmlFor="actual">Contraseña actual (temporal)</Label>
          <CampoPassword id="actual" name="actual" autoComplete="current-password" required />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="nueva">Contraseña nueva</Label>
        <CampoPassword id="nueva" name="nueva" autoComplete="new-password" minLength={8} required />
        <p className="text-muted-foreground text-xs">
          Mínimo 8 caracteres; no puede ser solo números ni una contraseña común.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmacion">Repite la contraseña nueva</Label>
        <CampoPassword id="confirmacion" name="confirmacion" autoComplete="new-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando && <Loader2 className="animate-spin" />}
        Guardar contraseña
      </Button>
    </form>
  );
}
