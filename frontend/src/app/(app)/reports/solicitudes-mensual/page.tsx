"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { CabeceraReporte, exportarExcel, nombreMes, usePeriodo } from "@/components/reportes/comun";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";

const CANTIDADES = {
  solicitudes_creadas: { label: "Solicitudes creadas", color: "var(--serie-1)" },
  trabajos_completados: { label: "Trabajos completados", color: "var(--serie-2)" },
} satisfies ChartConfig;
const EXITO = { porcentaje_exito: { label: "% de éxito", color: "var(--serie-3)" } } satisfies ChartConfig;

export default function SolicitudesMensualPage() {
  const [periodo, setPeriodo] = usePeriodo();
  const datos = useQuery({
    queryKey: ["reportes", "solicitudes-mensual", periodo],
    queryFn: () => unwrap(api.GET("/api/reportes/solicitudes-mensual", { params: { query: periodo } })),
  });
  const filas = datos.data ?? [];

  return (
    <>
      <CabeceraReporte
        titulo="Resumen mensual de solicitudes"
        descripcion="Solicitudes por mes de creación; trabajos completados por mes de finalización."
        periodo={periodo}
        onPeriodo={setPeriodo}
        onExportar={
          filas.length
            ? () =>
                exportarExcel(
                  "resumen_mensual_solicitudes",
                  ["Mes", "Solicitudes creadas", "Trabajos completados", "% éxito"],
                  filas.map((f) => [nombreMes(f.mes), f.solicitudes_creadas, f.trabajos_completados, f.porcentaje_exito]),
                )
            : undefined
        }
      />
      {datos.isPending ? (
        <Cargando />
      ) : datos.isError ? (
        <ErrorCarga error={datos.error} />
      ) : !filas.length ? (
        <Vacio texto="No hay datos en este periodo." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Solicitudes y trabajos completados</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CANTIDADES} className="aspect-auto h-72 w-full">
                <BarChart data={filas} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} strokeOpacity={0.4} />
                  <XAxis dataKey="mes" tickFormatter={nombreMes} tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip cursor={{ fillOpacity: 0.15 }} content={<ChartTooltipContent labelFormatter={(v) => nombreMes(String(v))} />} />
                  <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                  <Bar dataKey="solicitudes_creadas" fill="var(--color-solicitudes_creadas)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="trabajos_completados" fill="var(--color-trabajos_completados)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Porcentaje de éxito</CardTitle>
              <CardDescription>Trabajos completados sobre solicitudes creadas en el mes.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={EXITO} className="aspect-auto h-72 w-full">
                <LineChart data={filas} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.4} />
                  <XAxis dataKey="mes" tickFormatter={nombreMes} tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis domain={[0, (max: number) => Math.max(100, Math.ceil(max))]} unit="%" tickLine={false} axisLine={false} width={48} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => nombreMes(String(v))} />} />
                  <Line dataKey="porcentaje_exito" stroke="var(--color-porcentaje_exito)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Solicitudes creadas</TableHead>
                    <TableHead className="text-right">Trabajos completados</TableHead>
                    <TableHead className="text-right">% éxito</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f) => (
                    <TableRow key={f.mes}>
                      <TableCell className="capitalize">{nombreMes(f.mes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.solicitudes_creadas}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.trabajos_completados}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.porcentaje_exito === null ? "—" : `${f.porcentaje_exito}%`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
