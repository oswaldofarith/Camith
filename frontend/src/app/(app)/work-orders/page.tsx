"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { ESTADO_ORDEN, ESTADO_TRABAJO } from "@/components/common/estados";
import { PageHeader } from "@/components/common/PageHeader";
import { Paginacion } from "@/components/common/Paginacion";
import { TODOS } from "@/components/common/SelectorCatalogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";
import { useDirectorio } from "@/lib/api/hooks";

export default function OrdenesPage() {
  const { tieneRol } = useSesion();
  const tecnicos = useDirectorio({ rol: "tecnicoDeCampo" });
  const [estado, setEstado] = useState(TODOS);
  const [tecnico, setTecnico] = useState(TODOS);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  const ordenes = useQuery({
    queryKey: ["ordenes", "lista", { estado, tecnico, desde, hasta, pagina }],
    queryFn: () =>
      unwrap(
        api.GET("/api/ordenes", {
          params: {
            query: {
              estado: estado === TODOS ? undefined : [estado],
              tecnico: tecnico === TODOS ? null : Number(tecnico),
              desde: desde || null,
              hasta: hasta || null,
              page: pagina,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const filtro = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  };

  return (
    <>
      <PageHeader title="Órdenes de trabajo" description="Rutas asignadas a las unidades de campo.">
        {tieneRol("supervisor", "administrador") && (
          <Button asChild>
            <Link href="/work-orders/create"><Plus /> Nueva orden</Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={estado} onValueChange={filtro(setEstado)}>
          <SelectTrigger className="w-48" aria-label="Estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {Object.entries(ESTADO_ORDEN).map(([v, e]) => (
              <SelectItem key={v} value={v}>{e.etiqueta}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tecnico} onValueChange={filtro(setTecnico)}>
          <SelectTrigger className="w-56" aria-label="Técnico"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los técnicos</SelectItem>
            {(tecnicos.data ?? []).map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>{t.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" aria-label="Creadas desde" className="w-40" value={desde} onChange={(e) => filtro(setDesde)(e.target.value)} />
        <span className="text-muted-foreground text-sm">a</span>
        <Input type="date" aria-label="Creadas hasta" className="w-40" value={hasta} onChange={(e) => filtro(setHasta)(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {ordenes.isPending ? (
            <Cargando />
          ) : ordenes.isError ? (
            <ErrorCarga error={ordenes.error} />
          ) : !ordenes.data.items.length ? (
            <Vacio texto="No hay órdenes con estos filtros." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead className="hidden sm:table-cell">Creada</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead className="hidden md:table-cell">Trabajos</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenes.data.items.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      <Link href={`/work-orders/${o.id}`} className="text-primary hover:underline">{o.display_id}</Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {format(new Date(o.fecha_creacion), "dd/MM/yyyy HH:mm")}
                      <div className="text-muted-foreground text-xs">{o.creado_por_nombre}</div>
                    </TableCell>
                    <TableCell>
                      {o.unidades.map((u) => (
                        <div key={u.vehiculo} className="text-sm">
                          <span className="font-medium">{u.placa}</span>
                          <span className="text-muted-foreground text-xs"> · {u.tecnicos.map((t) => t.nombre).join(", ")}</span>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(o.trabajos_por_estado).map(([e, n]) => (
                          <Badge key={e} variant={ESTADO_TRABAJO[e]?.variante}>{n} {ESTADO_TRABAJO[e]?.etiqueta.toLowerCase() ?? e}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_ORDEN[o.estado_general]?.variante}>{ESTADO_ORDEN[o.estado_general]?.etiqueta ?? o.estado_general}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {ordenes.data && <Paginacion pagina={pagina} total={ordenes.data.count} porPagina={50} onCambiar={setPagina} />}
    </>
  );
}
