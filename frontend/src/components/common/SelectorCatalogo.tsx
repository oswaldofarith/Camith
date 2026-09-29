"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ItemCatalogo } from "@/lib/api/types";

export const TODOS = "__todos__";

/** Select de un catálogo; con `todos` añade la opción "Todos" (valor TODOS). */
export function SelectorCatalogo({
  items,
  valor,
  onCambiar,
  placeholder,
  todos,
  id,
  incluirInactivos,
}: {
  items: ItemCatalogo[] | undefined;
  valor: string;
  onCambiar: (valor: string) => void;
  placeholder?: string;
  todos?: string;
  id?: string;
  incluirInactivos?: boolean;
}) {
  const visibles = (items ?? []).filter((i) => incluirInactivos || i.activo || i.valor === valor);
  return (
    <Select value={valor} onValueChange={onCambiar}>
      <SelectTrigger id={id} aria-label={placeholder ?? todos}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {todos && <SelectItem value={TODOS}>{todos}</SelectItem>}
        {visibles.map((i) => (
          <SelectItem key={i.valor} value={i.valor}>
            {i.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
