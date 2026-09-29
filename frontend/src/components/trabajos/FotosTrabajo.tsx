"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import imageCompression from "browser-image-compression";
import { Camera, Loader2, X } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api/client";
import type { Trabajo } from "@/lib/api/types";

export const MAX_FOTOS = 5;

/** Miniaturas de las fotos de un trabajo; con `editable`, permite subir y quitar. */
export function FotosTrabajo({ trabajo, editable }: { trabajo: Trabajo; editable?: boolean }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
    void queryClient.invalidateQueries({ queryKey: ["trabajos"] });
  };

  const subir = useMutation({
    mutationFn: async (archivos: File[]) => {
      if (trabajo.fotos.length + archivos.length > MAX_FOTOS) {
        throw new Error(`Máximo ${MAX_FOTOS} fotos por trabajo.`);
      }
      // Se comprimen en el teléfono antes de enviarlas (datos móviles).
      const cuerpo = new FormData();
      for (const archivo of archivos) {
        const foto = await imageCompression(archivo, { maxSizeMB: 0.8, maxWidthOrHeight: 1920 });
        cuerpo.append("fotos", foto, archivo.name);
      }
      return unwrap(
        api.POST("/api/trabajos/{trabajo_id}/fotos", {
          params: { path: { trabajo_id: trabajo.id } },
          body: {} as never,
          bodySerializer: () => cuerpo,
        }),
      );
    },
    onSuccess: (fotos) => {
      toast.success(`${fotos.length} foto(s) subidas.`);
      refrescar();
    },
    onError: (e) => toast.error(e.message),
  });
  const quitar = useMutation({
    mutationFn: (fotoId: number) =>
      unwrap(api.DELETE("/api/trabajos/{trabajo_id}/fotos/{foto_id}", { params: { path: { trabajo_id: trabajo.id, foto_id: fotoId } } })),
    onSuccess: refrescar,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {trabajo.fotos.map((f) => (
        <div key={f.id} className="relative">
          <a href={f.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- archivos protegidos servidos por Caddy */}
            <img src={f.url} alt={`Foto del trabajo ${trabajo.codigo}`} className="size-16 rounded-md border object-cover" />
          </a>
          {editable && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 size-5 rounded-full"
              onClick={() => quitar.mutate(f.id)}
              aria-label="Quitar foto"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      ))}
      {editable && trabajo.fotos.length < MAX_FOTOS && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const archivos = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (archivos.length) subir.mutate(archivos);
            }}
          />
          <Button type="button" variant="outline" className="size-16 flex-col gap-0.5 text-xs" onClick={() => input.current?.click()} disabled={subir.isPending}>
            {subir.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
            Foto
          </Button>
        </>
      )}
      {!editable && !trabajo.fotos.length && <span className="text-muted-foreground text-xs">Sin fotos</span>}
    </div>
  );
}
