"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { CLAVE_ME } from "@/hooks/use-sesion";
import { ApiError } from "@/lib/api/client";

function crearQueryClient() {
  // Si la sesión expira, se recarga el usuario actual: al volver `null`, el
  // layout de la aplicación redirige al login.
  const alExpirarSesion = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      void client.invalidateQueries({ queryKey: CLAVE_ME });
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: alExpirarSesion }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        alExpirarSesion(error);
        // Las mutaciones muestran su error salvo que lo manejen ellas mismas.
        if (!mutation.options.onError) toast.error(error.message);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (fallos, error) =>
          !(error instanceof ApiError && error.status < 500) && fallos < 2,
      },
    },
  });
  return client;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(crearQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
