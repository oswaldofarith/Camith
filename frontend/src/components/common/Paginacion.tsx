import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Paginación simple para las listas paginadas de la API ({items, count}). */
export function Paginacion({
  pagina,
  total,
  porPagina,
  onCambiar,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <div className="text-muted-foreground mt-4 flex items-center justify-end gap-2 text-sm">
      <span>
        Página {pagina} de {paginas} · {total} registros
      </span>
      <Button variant="outline" size="icon" onClick={() => onCambiar(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior">
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="icon" onClick={() => onCambiar(pagina + 1)} disabled={pagina >= paginas} aria-label="Página siguiente">
        <ChevronRight />
      </Button>
    </div>
  );
}
