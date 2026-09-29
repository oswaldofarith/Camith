"use client";

import { useQuery } from "@tanstack/react-query";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { CabeceraReporte, exportarExcel, usePeriodo } from "@/components/reportes/comun";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";

export default function TecnicosPage() {
  const [periodo, setPeriodo] = usePeriodo();
  const datos = useQuery({
    queryKey: ["reportes", "tecnicos", periodo],
    queryFn: () => unwrap(api.GET("/api/reportes/tecnicos", { params: { query: periodo } })),
  });
  const tipos = datos.data?.tipos ?? [];
  const filas = datos.data?.filas ?? [];

  return (
    <>
      <CabeceraReporte
        titulo="Estadísticas por técnico"
        descripcion="Trabajos reportados en el periodo en órdenes donde el técnico estaba asignado (sin cancelados)."
        periodo={periodo}
        onPeriodo={setPeriodo}
        onExportar={
          filas.length
            ? () =>
                exportarExcel(
                  "estadisticas_tecnicos",
                  ["Técnico", "Atendidos", "Completados", "No completados", "Efectividad %", ...tipos],
                  filas.map((f) => [f.nombre, f.atendidos, f.completados, f.no_completados, f.efectividad, ...tipos.map((t) => f.por_tipo[t] ?? 0)]),
                )
            : undefined
        }
      />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {datos.isPending ? (
            <Cargando />
          ) : datos.isError ? (
            <ErrorCarga error={datos.error} />
          ) : !filas.length ? (
            <Vacio texto="No hay trabajos reportados en este periodo." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Técnico</TableHead>
                  <TableHead className="text-right">Atendidos</TableHead>
                  <TableHead className="text-right">Completados</TableHead>
                  <TableHead className="text-right">No completados</TableHead>
                  <TableHead className="w-48">Efectividad</TableHead>
                  {tipos.map((t) => <TableHead key={t} className="hidden text-right lg:table-cell">{t}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.tecnico_id}>
                    <TableCell className="font-medium">{f.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.atendidos}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.completados}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.no_completados}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-2 flex-1 rounded-full">
                          <div className="h-2 rounded-full" style={{ width: `${f.efectividad}%`, background: "var(--estado-completado)" }} />
                        </div>
                        <span className="w-12 text-right tabular-nums">{f.efectividad}%</span>
                      </div>
                    </TableCell>
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
