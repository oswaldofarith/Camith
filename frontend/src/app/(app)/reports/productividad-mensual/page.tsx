"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { SERIES } from "@/components/common/estados";
import { CabeceraReporte, exportarExcel, nombreMes, usePeriodo } from "@/components/reportes/comun";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const MAX_SERIES = 7; // la 8.ª se reserva para "Otros": nunca se generan colores nuevos

export default function ProductividadPage() {
  const [periodo, setPeriodo] = usePeriodo();
  const datos = useQuery({
    queryKey: ["reportes", "productividad", periodo],
    queryFn: () => unwrap(api.GET("/api/reportes/productividad-mensual", { params: { query: periodo } })),
  });
  const tipos = datos.data?.tipos ?? [];
  const filas = datos.data?.filas ?? [];

  // Los tipos más frecuentes conservan su color; el resto se agrupa en "Otros".
  const totales = Object.fromEntries(tipos.map((t) => [t, filas.reduce((s, f) => s + (f.por_tipo[t] ?? 0), 0)]));
  const principales = [...tipos].sort((a, b) => totales[b] - totales[a]).slice(0, tipos.length > MAX_SERIES + 1 ? MAX_SERIES : tipos.length);
  const conOtros = principales.length < tipos.length;
  const series = [...principales.map((t, i) => ({ clave: `s${i}`, label: t })), ...(conOtros ? [{ clave: "otros", label: "Otros" }] : [])];
  const config = Object.fromEntries(series.map((s, i) => [s.clave, { label: s.label, color: SERIES[i] }])) satisfies ChartConfig;
  const grafico = filas.map((f) => ({
    mes: f.mes,
    ...Object.fromEntries(principales.map((t, i) => [`s${i}`, f.por_tipo[t] ?? 0])),
    ...(conOtros && { otros: f.total - principales.reduce((s, t) => s + (f.por_tipo[t] ?? 0), 0) }),
  }));

  return (
    <>
      <CabeceraReporte
        titulo="Productividad por tipo de trabajo"
        descripcion="Trabajos completados por mes de finalización."
        periodo={periodo}
        onPeriodo={setPeriodo}
        onExportar={
          filas.length
            ? () =>
                exportarExcel(
                  "productividad_mensual",
                  ["Mes", ...tipos, "Total"],
                  filas.map((f) => [nombreMes(f.mes), ...tipos.map((t) => f.por_tipo[t] ?? 0), f.total]),
                )
            : undefined
        }
      />
      {datos.isPending ? (
        <Cargando />
      ) : datos.isError ? (
        <ErrorCarga error={datos.error} />
      ) : !filas.length ? (
        <Vacio texto="No hay trabajos completados en este periodo." />
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Trabajos completados por mes</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={config} className="aspect-auto h-80 w-full">
                <BarChart data={grafico} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.4} />
                  <XAxis dataKey="mes" tickFormatter={nombreMes} tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip cursor={{ fillOpacity: 0.15 }} content={<ChartTooltipContent labelFormatter={(v) => nombreMes(String(v))} />} />
                  <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                  {series.map((s, i) => (
                    <Bar
                      key={s.clave}
                      dataKey={s.clave}
                      stackId="tipo"
                      fill={`var(--color-${s.clave})`}
                      stroke="var(--card)"
                      strokeWidth={2}
                      radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                      maxBarSize={40}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    {tipos.map((t) => <TableHead key={t} className="text-right">{t}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f) => (
                    <TableRow key={f.mes}>
                      <TableCell className="capitalize">{nombreMes(f.mes)}</TableCell>
                      {tipos.map((t) => <TableCell key={t} className="text-right tabular-nums">{f.por_tipo[t] ?? 0}</TableCell>)}
                      <TableCell className="text-right font-medium tabular-nums">{f.total}</TableCell>
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
