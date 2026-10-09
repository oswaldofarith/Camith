import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

/** Estados comunes de una consulta: cargando, error o vacío. */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
      <Loader2 className="size-5 animate-spin" /> {texto}
    </div>
  );
}

export function ErrorCarga({ error }: { error: Error | null }) {
  return (
    <div className="text-destructive flex items-center justify-center gap-2 py-12 text-sm">
      <AlertTriangle className="size-5" /> {error?.message ?? "No se pudo cargar la información."}
    </div>
  );
}

export function Vacio({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12 text-sm">
      <Inbox className="size-8" />
      {texto}
      {children}
    </div>
  );
}
