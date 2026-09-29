"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, unwrap } from "@/lib/api/client";
import type { Equipo } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Selector de equipo con búsqueda en el servidor (código o dirección). */
export function BuscadorEquipo({
  valor,
  onCambiar,
  id,
}: {
  valor: Equipo | null;
  onCambiar: (equipo: Equipo) => void;
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto);
  const resultados = useQuery({
    queryKey: ["equipos", "buscar", q],
    queryFn: () => unwrap(api.GET("/api/equipos", { params: { query: { q, estado: "activo", page: 1 } } })),
    enabled: abierto,
  });

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-expanded={abierto} className="w-full justify-between font-normal">
          {valor ? `${valor.codigo} · ${valor.direccion}` : "Buscar equipo por código o dirección"}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Código o dirección…" value={texto} onValueChange={setTexto} />
          <CommandList>
            <CommandEmpty>{resultados.isFetching ? "Buscando…" : "Sin resultados."}</CommandEmpty>
            <CommandGroup>
              {resultados.data?.items.map((e) => (
                <CommandItem
                  key={e.codigo}
                  value={e.codigo}
                  onSelect={() => {
                    onCambiar(e);
                    setAbierto(false);
                  }}
                >
                  <Check className={cn("size-4", valor?.codigo === e.codigo ? "opacity-100" : "opacity-0")} />
                  <span className="font-medium">{e.codigo}</span>
                  <span className="text-muted-foreground truncate text-xs">{e.direccion}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
