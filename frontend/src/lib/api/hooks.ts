"use client";

import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "./client";
import type { Catalogos, ItemCatalogo } from "./types";

/** Todos los catálogos y la configuración (cambian poco: caché de 5 minutos). */
export function useCatalogos() {
  return useQuery({
    queryKey: ["catalogos"],
    queryFn: () => unwrap(api.GET("/api/catalogos")),
    staleTime: 5 * 60_000,
  });
}

/** Etiqueta legible de un valor de catálogo ("sur" → "Sur"). */
export function etiqueta(items: ItemCatalogo[] | undefined, valor: string | null | undefined) {
  if (!valor) return "—";
  return items?.find((i) => i.valor === valor)?.etiqueta ?? valor;
}

export type NombreCatalogo = keyof Omit<Catalogos, "localidades" | "configuracion">;

export function useUsuarios(filtros: { rol?: string; activo?: boolean } = {}) {
  return useQuery({
    queryKey: ["usuarios", filtros],
    queryFn: () => unwrap(api.GET("/api/accounts/usuarios", { params: { query: filtros } })),
  });
}

export function useHabilidades() {
  return useQuery({
    queryKey: ["habilidades"],
    queryFn: () => unwrap(api.GET("/api/accounts/skills")),
    staleTime: 5 * 60_000,
  });
}
