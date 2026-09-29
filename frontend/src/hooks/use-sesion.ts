"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { cerrarSesion } from "@/lib/api/auth";
import { api, unwrap } from "@/lib/api/client";
import type { Me, Rol } from "@/lib/api/types";

export const CLAVE_ME = ["me"] as const;

/** Usuario autenticado actual (o `null` si no hay sesión). */
export function useSesion() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useQuery({
    queryKey: CLAVE_ME,
    queryFn: async (): Promise<Me | null> => {
      const { data, response } = await api.GET("/api/accounts/me");
      if (response.status === 401) return null;
      return unwrap(Promise.resolve({ data, response }));
    },
    staleTime: 5 * 60_000,
  });

  const usuario = query.data ?? null;
  return {
    usuario,
    cargando: query.isPending,
    tieneRol: (...roles: Rol[]) =>
      !!usuario && usuario.perfiles.some((p) => roles.includes(p as Rol)),
    salir: async () => {
      await cerrarSesion();
      queryClient.clear();
      router.replace("/login");
    },
  };
}
