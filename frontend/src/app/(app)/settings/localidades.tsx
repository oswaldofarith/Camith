"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";
import type { Catalogos } from "@/lib/api/types";

export function EditorLocalidades({ catalogos }: { catalogos: Catalogos }) {
  const queryClient = useQueryClient();
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["catalogos"] });
  const [nueva, setNueva] = useState({ nombre: "", lat: "", lng: "" });
  const crear = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/catalogos/localidades", {
          body: { nombre: nueva.nombre.trim(), lat: Number(nueva.lat), lng: Number(nueva.lng) },
        }),
      ),
    onSuccess: () => {
      setNueva({ nombre: "", lat: "", lng: "" });
      refrescar();
    },
  });
  const borrar = useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE("/api/catalogos/localidades/{localidad_id}", { params: { path: { localidad_id: id } } })),
    onSettled: refrescar,
  });

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Localidad</TableHead>
              <TableHead>Latitud</TableHead>
              <TableHead>Longitud</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalogos.localidades.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.nombre}</TableCell>
                <TableCell>{l.lat}</TableCell>
                <TableCell>{l.lng}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => borrar.mutate(l.id)} aria-label={`Eliminar ${l.nombre}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <Input placeholder="Nombre" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
              </TableCell>
              <TableCell>
                <Input type="number" step="any" placeholder="-2.17" value={nueva.lat} onChange={(e) => setNueva({ ...nueva, lat: e.target.value })} />
              </TableCell>
              <TableCell>
                <Input type="number" step="any" placeholder="-79.92" value={nueva.lng} onChange={(e) => setNueva({ ...nueva, lng: e.target.value })} />
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => crear.mutate()}
                  disabled={!nueva.nombre.trim() || !nueva.lat || !nueva.lng || crear.isPending}
                  aria-label="Añadir localidad"
                >
                  <Plus />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
