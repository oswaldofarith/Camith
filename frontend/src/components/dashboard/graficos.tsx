"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { components } from "@/lib/api/schema";

type Dia = components["schemas"]["TendenciaDia"];

// Orden de apilado elegido para que rojo y verde nunca queden contiguos (daltonismo).
const ESTADOS = {
  completados: { label: "Completados", color: "var(--estado-completado)" },
  pendientes: { label: "Pendientes", color: "var(--estado-pendiente)" },
  no_completados: { label: "No completados", color: "var(--estado-no-completado)" },
  cancelados: { label: "Cancelados", color: "var(--estado-cancelado)" },
} satisfies ChartConfig;

const diaCorto = (fecha: string) => format(new Date(`${fecha}T12:00`), "EEE d", { locale: es });
const diaLargo = (fecha: string) => format(new Date(`${fecha}T12:00`), "EEEE d 'de' MMMM", { locale: es });

/** Barra horizontal apilada con el reparto del día (en vez de una tarta). */
export function ProgresoDelDia({ dia }: { dia: Dia | undefined }) {
  const claves = Object.keys(ESTADOS) as (keyof typeof ESTADOS)[];
  const total = dia ? claves.reduce((s, k) => s + dia[k], 0) : 0;
  if (!dia || !total) return <p className="text-muted-foreground text-sm">Hoy no hay trabajos en órdenes.</p>;
  const hechos = dia.completados + dia.no_completados + dia.cancelados;
  return (
    <div className="space-y-3">
      <p className="text-3xl font-semibold">
        {Math.round((hechos * 100) / total)}%<span className="text-muted-foreground ml-2 text-sm font-normal">reportado ({hechos} de {total})</span>
      </p>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Reparto de los trabajos de hoy por estado">
        {claves.map((k) =>
          dia[k] ? <div key={k} style={{ width: `${(dia[k] * 100) / total}%`, background: ESTADOS[k].color }} title={`${ESTADOS[k].label}: ${dia[k]}`} /> : null,
        )}
      </div>
      <ul className="space-y-1 text-sm">
        {claves.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: ESTADOS[k].color }} />
            <span className="text-muted-foreground">{ESTADOS[k].label}</span>
            <span className="ml-auto font-medium tabular-nums">{dia[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrabajosPorDia({ datos }: { datos: Dia[] }) {
  return (
    <ChartContainer config={ESTADOS} className="aspect-auto h-64 w-full">
      <BarChart data={datos} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis dataKey="fecha" tickFormatter={diaCorto} tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={{ fillOpacity: 0.15 }} content={<ChartTooltipContent labelFormatter={(v) => diaLargo(String(v))} />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        {(Object.keys(ESTADOS) as (keyof typeof ESTADOS)[]).map((k, i, todas) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="estado"
            fill={`var(--color-${k})`}
            // Separación de 2 px entre segmentos y extremo redondeado arriba.
            stroke="var(--card)"
            strokeWidth={2}
            radius={i === todas.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={32}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

const ORDENES = { ordenes: { label: "Órdenes", color: "var(--serie-1)" } } satisfies ChartConfig;

export function OrdenesPorDia({ datos }: { datos: Dia[] }) {
  return (
    <ChartContainer config={ORDENES} className="aspect-auto h-64 w-full">
      <BarChart data={datos} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis dataKey="fecha" tickFormatter={diaCorto} tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={{ fillOpacity: 0.15 }} content={<ChartTooltipContent labelFormatter={(v) => diaLargo(String(v))} />} />
        <Bar dataKey="ordenes" fill="var(--color-ordenes)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartContainer>
  );
}
