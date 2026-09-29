"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { SelectorCatalogo, TODOS } from "@/components/common/SelectorCatalogo";
import { CabeceraReporte, exportarExcel, usePeriodo } from "@/components/reportes/comun";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";
import { etiqueta, useCatalogos } from "@/lib/api/hooks";

export default function RankingEquiposPage() {
  const [periodo, setPeriodo] = usePeriodo();
  const [tipo, setTipo] = useState(TODOS);
  const catalogos = useCatalogos();
  const datos = useQuery({
    queryKey: ["reportes", "ranking", periodo, tipo],
    queryFn: () =>
      unwrap(
        api.GET("/api/reportes/ranking-equipos", {
          params: { query: { ...periodo, tipo_equipo: tipo === TODOS ? undefined : [tipo], limite: 100 } },
        }),
      ),
  });
  const tipos = datos.data?.tipos ?? [];
  const filas = datos.data?.filas ?? [];
  const maximo = Math.max(1, ...filas.map((f) => f.total));

  return (
    <>
      <CabeceraReporte
        titulo="Ranking de equipos por intervenciones"
        descripcion="Trabajos completados o no completados en el periodo (sin cancelados). Top 100."
        periodo={periodo}
        onPeriodo={setPeriodo}
        onExportar={
          filas.length
            ? () =>
                exportarExcel(
                  "ranking_equipos",
                  ["Equipo", "Tipo", "Intervenciones", "No completadas", ...tipos],
                  filas.map((f) => [f.equipo, etiqueta(catalogos.data?.tipos_equipo, f.tipo_equipo), f.total, f.no_completados, ...tipos.map((t) => f.por_tipo[t] ?? 0)]),
                )
            : undefined
        }
      >
        <div className="w-48">
          <SelectorCatalogo items={catalogos.data?.tipos_equipo} valor={tipo} onCambiar={setTipo} todos="Todos los tipos" incluirInactivos />
        </div>
      </CabeceraReporte>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {datos.isPending ? (
            <Cargando />
          ) : datos.isError ? (
            <ErrorCarga error={datos.error} />
          ) : !filas.length ? (
            <Vacio texto="Ningún equipo tuvo intervenciones en este periodo." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-1/4">Intervenciones</TableHead>
                  <TableHead className="text-right">No completadas</TableHead>
                  {tipos.map((t) => <TableHead key={t} className="hidden text-right lg:table-cell">{t}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => (
                  <TableRow key={f.equipo}>
                    <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <Link href={`/equipment/${encodeURIComponent(f.equipo)}`} className="text-primary hover:underline">{f.equipo}</Link>
                    </TableCell>
                    <TableCell>{etiqueta(catalogos.data?.tipos_equipo, f.tipo_equipo)}</TableCell>
                    <TableCell>
                      {/* Barra en la celda: magnitud de un solo tono, con el número al lado. */}
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-2 flex-1 rounded-full">
                          <div className="h-2 rounded-full" style={{ width: `${(f.total * 100) / maximo}%`, background: "var(--serie-1)" }} />
                        </div>
                        <span className="w-8 text-right font-medium tabular-nums">{f.total}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.no_completados}</TableCell>
                    {tipos.map((t) => <TableCell key={t} className="hidden text-right tabular-nums lg:table-cell">{f.por_tipo[t] ?? 0}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
