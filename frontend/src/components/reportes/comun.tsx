"use client";

import { format, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import writeXlsxFile from "write-excel-file/browser";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Periodo = { desde: string; hasta: string };

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Periodo por defecto: los últimos 6 meses completos más el actual. */
export function usePeriodo(): [Periodo, (p: Periodo) => void] {
  return useState<Periodo>(() => ({ desde: iso(startOfMonth(subMonths(new Date(), 5))), hasta: iso(new Date()) }));
}

export function SelectorPeriodo({ periodo, onCambiar }: { periodo: Periodo; onCambiar: (p: Periodo) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="desde" className="text-xs">Desde</Label>
        <Input id="desde" type="date" className="w-40" value={periodo.desde} max={periodo.hasta} onChange={(e) => e.target.value && onCambiar({ ...periodo, desde: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="hasta" className="text-xs">Hasta</Label>
        <Input id="hasta" type="date" className="w-40" value={periodo.hasta} min={periodo.desde} onChange={(e) => e.target.value && onCambiar({ ...periodo, hasta: e.target.value })} />
      </div>
    </div>
  );
}

/** "2026-09" → "sep 2026" */
export const nombreMes = (mes: string) => format(new Date(`${mes}-15T12:00`), "MMM yyyy", { locale: es });

type Celda = string | number | null;

export async function exportarExcel(archivo: string, encabezados: string[], filas: Celda[][]) {
  await writeXlsxFile([
    encabezados.map((value) => ({ value, fontWeight: "bold" as const })),
    ...filas.map((f) => f.map((value) => ({ value: value ?? "" }))),
  ]).toFile(`${archivo}.xlsx`);
}

export function CabeceraReporte({
  titulo,
  descripcion,
  periodo,
  onPeriodo,
  onExportar,
  children,
}: {
  titulo: string;
  descripcion: string;
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  onExportar?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={titulo} description={descripcion}>
        <Button variant="outline" asChild>
          <Link href="/reports"><ArrowLeft /> Reportes</Link>
        </Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SelectorPeriodo periodo={periodo} onCambiar={onPeriodo} />
        {children}
        {onExportar && (
          <Button variant="outline" className="ml-auto" onClick={onExportar}>
            <Download /> Exportar a Excel
          </Button>
        )}
      </div>
    </>
  );
}
