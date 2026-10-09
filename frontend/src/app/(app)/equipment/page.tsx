"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, FileUp, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Paginacion } from "@/components/common/Paginacion";
import { SelectorCatalogo, TODOS } from "@/components/common/SelectorCatalogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSesion } from "@/hooks/use-sesion";
import { api, unwrap } from "@/lib/api/client";
import { etiqueta, useCatalogos } from "@/lib/api/hooks";
import type { Equipo } from "@/lib/api/types";
import { exportarEquipos } from "@/lib/equipos-excel";

import { FormularioEquipo } from "./formulario-equipo";
import { DialogoImportar } from "./importar";

const POR_PAGINA = 50;

export default function EquiposPage() {
  const { tieneRol } = useSesion();
  const puedeEditar = tieneRol("administrador", "supervisor");
  const catalogos = useCatalogos();
  const [pagina, setPagina] = useState(1);
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto);
  const [filtros, setFiltros] = useState({ tipo: TODOS, marca: TODOS, zona: TODOS, estado: TODOS });
  const [editando, setEditando] = useState<Equipo | "nuevo" | null>(null);
  const [importando, setImportando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const query = Object.fromEntries(Object.entries(filtros).map(([k, v]) => [k, v === TODOS ? null : v]));
  const equipos = useQuery({
    queryKey: ["equipos", "lista", query, q, pagina],
    queryFn: () => unwrap(api.GET("/api/equipos", { params: { query: { ...query, q, page: pagina } } })),
    placeholderData: keepPreviousData,
  });

  const filtrar = (k: keyof typeof filtros) => (v: string) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPagina(1);
  };

  async function exportar() {
    if (!catalogos.data || !equipos.data) return;
    setExportando(true);
    try {
      // Se exportan todos los equipos que cumplen los filtros, no solo la página visible.
      const paginas = Math.ceil(equipos.data.count / POR_PAGINA);
      const todas = await Promise.all(
        Array.from({ length: paginas }, (_, i) =>
          unwrap(api.GET("/api/equipos", { params: { query: { ...query, q, page: i + 1 } } })),
        ),
      );
      await exportarEquipos(todas.flatMap((p) => p.items), catalogos.data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <PageHeader title="Equipos" description="Colectores, repetidores y medidores de la red.">
        <Button variant="outline" onClick={exportar} disabled={exportando || !equipos.data?.count}>
          <Download /> Exportar
        </Button>
        {puedeEditar && (
          <>
            <Button variant="outline" onClick={() => setImportando(true)}>
              <FileUp /> Importar
            </Button>
            <Button onClick={() => setEditando("nuevo")}>
              <Plus /> Nuevo equipo
            </Button>
          </>
        )}
      </PageHeader>

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              className="pl-8"
              placeholder="Código o dirección"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          <SelectorCatalogo items={catalogos.data?.tipos_equipo} valor={filtros.tipo} onCambiar={filtrar("tipo")} todos="Todos los tipos" incluirInactivos />
          <SelectorCatalogo items={catalogos.data?.marcas} valor={filtros.marca} onCambiar={filtrar("marca")} todos="Todas las marcas" incluirInactivos />
          <SelectorCatalogo items={catalogos.data?.zonas} valor={filtros.zona} onCambiar={filtrar("zona")} todos="Todas las zonas" incluirInactivos />
          <SelectorCatalogo items={catalogos.data?.estados_equipo} valor={filtros.estado} onCambiar={filtrar("estado")} todos="Todos los estados" incluirInactivos />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {equipos.isPending ? (
            <Cargando />
          ) : equipos.isError ? (
            <ErrorCarga error={equipos.error} />
          ) : !equipos.data.items.length ? (
            <Vacio texto="No hay equipos que coincidan con los filtros." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identificación</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">Marca</TableHead>
                  <TableHead className="hidden lg:table-cell">Dirección</TableHead>
                  <TableHead className="hidden md:table-cell">Zona</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden xl:table-cell">Última revisión</TableHead>
                  <TableHead className="hidden xl:table-cell">Próx. mant.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipos.data.items.map((e) => (
                  <TableRow key={e.codigo}>
                    <TableCell className="font-medium">
                      <Link href={`/equipment/${encodeURIComponent(e.codigo)}`} className="text-primary hover:underline">
                        {e.codigo}
                      </Link>
                    </TableCell>
                    <TableCell>{etiqueta(catalogos.data?.tipos_equipo, e.tipo)}</TableCell>
                    <TableCell className="hidden md:table-cell">{etiqueta(catalogos.data?.marcas, e.marca)}</TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-64 truncate lg:table-cell">{e.direccion}</TableCell>
                    <TableCell className="hidden md:table-cell">{etiqueta(catalogos.data?.zonas, e.zona)}</TableCell>
                    <TableCell>
                      <Badge variant={e.estado === "activo" ? "default" : "outline"}>
                        {etiqueta(catalogos.data?.estados_equipo, e.estado)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {e.fecha_ultima_revision ? format(new Date(e.fecha_ultima_revision), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{e.proximo_mantenimiento_programado ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {equipos.data && <Paginacion pagina={pagina} total={equipos.data.count} porPagina={POR_PAGINA} onCambiar={setPagina} />}

      {editando && <FormularioEquipo equipo={editando === "nuevo" ? null : editando} onCerrar={() => setEditando(null)} />}
      <DialogoImportar abierto={importando} onCambiar={setImportando} />
    </>
  );
}
