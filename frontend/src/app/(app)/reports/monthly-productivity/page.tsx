
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Icons } from "@/components/icons";
import { format, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { Trabajo, OrdenDeTrabajo } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getWorkOrders } from "@/services/workOrderService";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MonthlyProductivityData {
  monthYear: string; // "YYYY-MM" for sorting
  monthDisplay: string; // "MMM yyyy" for display
  communicationRevisions: number;
  maintenances: number;
  installations: number;
  others: number;
}

export default function MonthlyProductivityReportPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date(new Date().getFullYear(), 0, 1)), // Start of the year
    to: endOfMonth(new Date()), // End of current month
  });
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<MonthlyProductivityData[] | null>(null);
  const { toast } = useToast();

  const [allTrabajosFromDB, setAllTrabajosFromDB] = useState<Trabajo[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchSourceData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const fetchedWorkOrders = await getWorkOrders();
      const allTrabajos = fetchedWorkOrders.reduce((acc: Trabajo[], order: OrdenDeTrabajo) => {
        if (order.trabajos && order.trabajos.length > 0) {
          acc.push(...order.trabajos);
        }
        return acc;
      }, []);
      setAllTrabajosFromDB(allTrabajos);
    } catch (error) {
      console.error("Error fetching source data for monthly productivity report:", error);
      toast({
        title: "Error al Cargar Datos Base",
        description: "No se pudieron obtener los trabajos de Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSourceData();
  }, [fetchSourceData]);

  const handleGenerateReport = async () => {
    if (!dateRange || !dateRange.from || !dateRange.to) {
      toast({ title: "Error", description: "Por favor, seleccione un rango de fechas válido.", variant: "destructive" });
      return;
    }
    if (isLoadingData) {
      toast({ title: "Cargando Datos", description: "Los datos base aún se están cargando. Intente en un momento.", variant: "default" });
      return;
    }

    setIsLoadingReport(true);
    setReportData(null);
    await new Promise(resolve => setTimeout(resolve, 100));

    const { from, to } = dateRange;
    const startDate = startOfDay(from);
    const endDate = endOfDay(to);

    const monthlyDataMap: { [key: string]: MonthlyProductivityData } = {};

    allTrabajosFromDB.forEach(trabajo => {
      let fechaFinalizacionDate: Date | null = null;
      if (trabajo.fechaFinalizacion) {
         if (trabajo.fechaFinalizacion instanceof Date) fechaFinalizacionDate = trabajo.fechaFinalizacion;
         else {
            const parsed = new Date(trabajo.fechaFinalizacion);
            if(!isNaN(parsed.getTime())) fechaFinalizacionDate = parsed;
         }
      }

      if (trabajo.estado === "Completado" && fechaFinalizacionDate && isWithinInterval(fechaFinalizacionDate, { start: startDate, end: endDate })) {
        const monthKey = format(fechaFinalizacionDate, "yyyy-MM");
        if (!monthlyDataMap[monthKey]) {
          monthlyDataMap[monthKey] = {
            monthYear: monthKey,
            monthDisplay: format(fechaFinalizacionDate, "MMM yyyy", { locale: es }),
            communicationRevisions: 0,
            maintenances: 0,
            installations: 0,
            others: 0,
          };
        }

        switch (trabajo.tipoTrabajo) {
          case "Revisión de comunicación":
            monthlyDataMap[monthKey].communicationRevisions++;
            break;
          case "Mantenimiento":
            monthlyDataMap[monthKey].maintenances++;
            break;
          case "Instalación":
            monthlyDataMap[monthKey].installations++;
            break;
          case "Otro":
            monthlyDataMap[monthKey].others++;
            break;
          default:
            // Optionally handle or log unknown tipoTrabajo
            break;
        }
      }
    });

    const data = Object.values(monthlyDataMap).sort((a, b) => b.monthYear.localeCompare(a.monthYear)); // Sort descending by YYYY-MM
    setReportData(data);

    if (data.length > 0) {
      toast({ title: "Reporte Generado", description: "Productividad mensual por tipo de trabajo calculada." });
    } else {
      toast({ title: "Reporte Generado", description: "No se encontraron trabajos completados para los filtros seleccionados.", variant: "default" });
    }
    setIsLoadingReport(false);
  };
  
  if (isLoadingData) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Productividad Mensual por Tipo de Trabajo" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Cargando datos base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Productividad Mensual por Tipo de Trabajo" />
      <Card>
        <CardHeader>
          <CardTitle>Filtros del Reporte</CardTitle>
          <CardDescription>Seleccione el rango de fechas para el reporte (basado en fecha de finalización de trabajos completados).</CardDescription>
        </CardHeader>
        <CardContent>
          <label htmlFor="dateRange" className="block text-sm font-medium mb-1">Rango de Fechas</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button id="dateRange" variant={"outline"} className="w-full md:w-[300px] justify-start text-left font-normal">
                <Icons.calendar className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (<>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>)
                  : (format(dateRange.from, "LLL dd, y", { locale: es }))
                ) : (<span>Seleccionar rango</span>)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
            </PopoverContent>
          </Popover>
        </CardContent>
        <CardFooter>
          <Button onClick={handleGenerateReport} disabled={isLoadingReport || isLoadingData}>
            {isLoadingReport ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.reports className="mr-2 h-4 w-4" />}
            Generar Reporte
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultados del Reporte</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[200px] bg-muted/20 rounded-md p-0">
          <ScrollArea className="h-[400px]">
            {isLoadingReport && <div className="text-center p-8 flex items-center justify-center h-full"><Icons.loader className="mx-auto h-10 w-10 animate-spin" /><p className="ml-2">Generando reporte...</p></div>}
            {!isLoadingReport && !reportData && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">Seleccione filtros y genere el reporte.</p>}
            {!isLoadingReport && reportData && reportData.length === 0 && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">No hay datos para los filtros seleccionados.</p>}
            {!isLoadingReport && reportData && reportData.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Rev. Comunicación</TableHead>
                    <TableHead className="text-right">Mantenimientos</TableHead>
                    <TableHead className="text-right">Instalaciones</TableHead>
                    <TableHead className="text-right">Otros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map(item => (
                    <TableRow key={item.monthYear}>
                      <TableCell>{item.monthDisplay}</TableCell>
                      <TableCell className="text-right">{item.communicationRevisions}</TableCell>
                      <TableCell className="text-right">{item.maintenances}</TableCell>
                      <TableCell className="text-right">{item.installations}</TableCell>
                      <TableCell className="text-right">{item.others}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
