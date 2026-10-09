"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api, unwrap } from "@/lib/api/client";
import { useCatalogos } from "@/lib/api/hooks";
import { descargarPlantilla, type EquipoIn, leerEquipos } from "@/lib/equipos-excel";

const TAMANO_LOTE = 200;

export function DialogoImportar({ abierto, onCambiar }: { abierto: boolean; onCambiar: (a: boolean) => void }) {
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ creados: number; actualizados: number; errores: string[] } | null>(null);

  async function importar() {
    if (!archivo || !catalogos.data) return;
    setResultado(null);
    setProgreso(0);
    try {
      const { equipos, errores } = await leerEquipos(archivo, catalogos.data);
      let creados = 0;
      let actualizados = 0;
      // Por lotes: el servidor valida cada equipo y devuelve los errores por código.
      for (let i = 0; i < equipos.length; i += TAMANO_LOTE) {
        // EquipoLote → EquipoIn: los campos que faltan tienen valor por defecto en la API.
        const lote = equipos.slice(i, i + TAMANO_LOTE) as EquipoIn[];
        const r = await unwrap(api.POST("/api/equipos/lote", { body: lote }));
        creados += r.creados;
        actualizados += r.actualizados;
        errores.push(...r.errores.map((e) => `${e.codigo}: ${e.error}`));
        setProgreso(Math.round(((i + TAMANO_LOTE) / equipos.length) * 100));
      }
      setResultado({ creados, actualizados, errores });
      void queryClient.invalidateQueries({ queryKey: ["equipos"] });
      toast.success(`Importación terminada: ${creados} nuevos, ${actualizados} actualizados.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgreso(null);
    }
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(a) => {
        onCambiar(a);
        if (!a) {
          setArchivo(null);
          setResultado(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar equipos</DialogTitle>
          <DialogDescription>
            Archivo CSV o Excel con la columna <code>identificacion</code>. Los equipos nuevos se crean;
            en los existentes solo cambian las columnas que trae el archivo (las revisiones las lleva el
            sistema).
          </DialogDescription>
        </DialogHeader>
        <Button variant="link" className="h-auto justify-start p-0" onClick={() => descargarPlantilla()}>
          <Download /> Descargar plantilla
        </Button>
        <Input type="file" accept=".csv,.xlsx" aria-label="Archivo de equipos" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        {progreso !== null && <Progress value={progreso} />}
        {resultado && (
          <Alert variant={resultado.errores.length ? "destructive" : "default"}>
            <AlertTitle>
              {resultado.creados} creados · {resultado.actualizados} actualizados · {resultado.errores.length} con errores
            </AlertTitle>
            {!!resultado.errores.length && (
              <AlertDescription>
                <ul className="max-h-40 list-disc overflow-y-auto pl-4 text-xs">
                  {resultado.errores.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambiar(false)}>Cerrar</Button>
          <Button onClick={importar} disabled={!archivo || progreso !== null}>
            {progreso !== null ? <Loader2 className="animate-spin" /> : <Upload />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
