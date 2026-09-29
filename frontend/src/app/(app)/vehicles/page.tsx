"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { SelectorCatalogo, TODOS } from "@/components/common/SelectorCatalogo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";
import { etiqueta, useCatalogos, useUsuarios } from "@/lib/api/hooks";
import type { Vehiculo } from "@/lib/api/types";

const IMAGENES: Record<string, string> = {
  camionetaCabinaSimple: "/images/camionetaCabinaSimple.webp",
  camionetaCabinaDoble: "/images/camionetaCabinaDoble.webp",
  camionCanasta: "/images/camionCanasta.webp",
};
const SIN_CUSTODIO = "__ninguno__";

function FormularioVehiculo({ vehiculo, onCerrar }: { vehiculo: Vehiculo | "nuevo"; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const usuarios = useUsuarios({ activo: true });
  const existente = vehiculo === "nuevo" ? null : vehiculo;
  const [datos, setDatos] = useState({
    codigo: existente?.codigo ?? "",
    placa: existente?.placa ?? "",
    tipo: existente?.tipo ?? "",
    estado: existente?.estado ?? "disponible",
    custodio_id: existente?.custodio_id ?? null,
  });
  const guardar = useMutation({
    mutationFn: () =>
      existente
        ? unwrap(
            api.PATCH("/api/vehiculos/{codigo}", {
              params: { path: { codigo: existente.codigo } },
              body: { placa: datos.placa, tipo: datos.tipo, estado: datos.estado, custodio_id: datos.custodio_id },
            }),
          )
        : unwrap(api.POST("/api/vehiculos", { body: datos })),
    onSuccess: () => {
      toast.success("Vehículo guardado.");
      void queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      onCerrar();
    },
    onError: (e) => toast.error(e.message),
  });
  const completo = datos.codigo.trim() && datos.placa.trim() && datos.tipo && datos.estado;

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existente ? `Editar ${existente.placa}` : "Nuevo vehículo"}</DialogTitle>
        </DialogHeader>
        <form
          id="form-vehiculo"
          className="grid grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="codigo">Nº de unidad</Label>
            <Input id="codigo" value={datos.codigo} disabled={!!existente} onChange={(e) => setDatos({ ...datos, codigo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="placa">Placa</Label>
            <Input id="placa" value={datos.placa} onChange={(e) => setDatos({ ...datos, placa: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <SelectorCatalogo id="tipo" items={catalogos.data?.tipos_vehiculo} valor={datos.tipo} onCambiar={(tipo) => setDatos({ ...datos, tipo })} placeholder="Tipo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estado">Estado</Label>
            <SelectorCatalogo id="estado" items={catalogos.data?.estados_vehiculo} valor={datos.estado} onCambiar={(estado) => setDatos({ ...datos, estado })} placeholder="Estado" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="custodio">Custodio</Label>
            <Select
              value={datos.custodio_id ? String(datos.custodio_id) : SIN_CUSTODIO}
              onValueChange={(v) => setDatos({ ...datos, custodio_id: v === SIN_CUSTODIO ? null : Number(v) })}
            >
              <SelectTrigger id="custodio"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CUSTODIO}>Sin custodio</SelectItem>
                {(usuarios.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-vehiculo" disabled={!completo || guardar.isPending}>
            {guardar.isPending && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VehiculosPage() {
  const queryClient = useQueryClient();
  const catalogos = useCatalogos();
  const usuarios = useUsuarios();
  const [estado, setEstado] = useState(TODOS);
  const [editando, setEditando] = useState<Vehiculo | "nuevo" | null>(null);
  const [borrando, setBorrando] = useState<Vehiculo | null>(null);

  const vehiculos = useQuery({
    queryKey: ["vehiculos", estado],
    queryFn: () => unwrap(api.GET("/api/vehiculos", { params: { query: { estado: estado === TODOS ? null : estado } } })),
  });
  const borrar = useMutation({
    mutationFn: (v: Vehiculo) => unwrap(api.DELETE("/api/vehiculos/{codigo}", { params: { path: { codigo: v.codigo } } })),
    onSuccess: () => {
      toast.success("Vehículo eliminado.");
      void queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
    },
  });
  const nombreUsuario = (id: number | null) => usuarios.data?.find((u) => u.id === id)?.nombre ?? "—";

  return (
    <>
      <PageHeader title="Vehículos" description="Flota disponible para las unidades de campo.">
        <div className="w-48">
          <SelectorCatalogo items={catalogos.data?.estados_vehiculo} valor={estado} onCambiar={setEstado} todos="Todos los estados" />
        </div>
        <Button onClick={() => setEditando("nuevo")}>
          <Plus /> Nuevo vehículo
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          {vehiculos.isPending ? (
            <Cargando />
          ) : vehiculos.isError ? (
            <ErrorCarga error={vehiculos.error} />
          ) : !vehiculos.data.length ? (
            <Vacio texto="No hay vehículos registrados." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden w-24 sm:table-cell">Imagen</TableHead>
                  <TableHead>Nº unidad</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Custodio</TableHead>
                  <TableHead className="w-24"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehiculos.data.map((v) => (
                  <TableRow key={v.codigo}>
                    <TableCell className="hidden sm:table-cell">
                      {IMAGENES[v.tipo] && <Image src={IMAGENES[v.tipo]} alt="" width={72} height={40} className="h-10 w-auto object-contain" />}
                    </TableCell>
                    <TableCell className="font-medium">{v.codigo}</TableCell>
                    <TableCell>{v.placa}</TableCell>
                    <TableCell className="hidden md:table-cell">{etiqueta(catalogos.data?.tipos_vehiculo, v.tipo)}</TableCell>
                    <TableCell>
                      <Badge variant={v.estado === "disponible" ? "default" : "outline"}>
                        {etiqueta(catalogos.data?.estados_vehiculo, v.estado)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{nombreUsuario(v.custodio_id)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditando(v)} aria-label={`Editar ${v.placa}`}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setBorrando(v)} aria-label={`Eliminar ${v.placa}`}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editando && <FormularioVehiculo vehiculo={editando} onCerrar={() => setEditando(null)} />}
      <AlertDialog open={!!borrando} onOpenChange={(a) => !a && setBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el vehículo {borrando?.placa}?</AlertDialogTitle>
            <AlertDialogDescription>
              Si ya participó en órdenes de trabajo no se podrá eliminar; en ese caso, cámbialo a “Dado de baja”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => borrando && borrar.mutate(borrando)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
