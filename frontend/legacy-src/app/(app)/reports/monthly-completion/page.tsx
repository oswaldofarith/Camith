
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Icons } from "@/components/icons";
import { format, isWithinInterval, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { Trabajo, Solicitud, OrdenDeTrabajo } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ChartContainer, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer } from "recharts";
import { getSolicitudes } from "@/services/requestService";
import { getWorkOrders } from "@/services/workOrderService";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MonthlySummaryData { 
  monthYear: string; // "YYYY-MM"
  monthDisplay: string; // "MMM yyyy"
  solicitudesCreadas: number; 
  trabajosExitosos: number; 
}

const chartConfig = {
  solicitudesCreadas: { label: "Solicitudes Creadas", color: "hsl(var(--chart-1))" },
  trabajosExitosos: { label: "Trabajos Exitosos", color: "hsl(var(--chart-2))" },
} satisfies Parameters<typeof ChartContainer>[0]["config"];

export default function MonthlyRequestSummaryReportPage() { // Renamed component
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date(new Date().getFullYear(), 0, 1)), // Start of the year
    to: endOfMonth(new Date()), // End of current month
  });
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<MonthlySummaryData[] | null>(null);
  const { toast } = useToast();

  const [allSolicitudesFromDB, setAllSolicitudesFromDB] = useState<Solicitud[]>([]);
  const [allTrabajosFromDB, setAllTrabajosFromDB] = useState<Trabajo[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchSourceData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [fetchedSolicitudes, fetchedWorkOrders] = await Promise.all([
        getSolicitudes(),
        getWorkOrders()
      ]);
      setAllSolicitudesFromDB(fetchedSolicitudes);
      
      const allTrabajos = fetchedWorkOrders.reduce((acc: Trabajo[], order: OrdenDeTrabajo) => {
        if (order.trabajos && order.trabajos.length > 0) {
          acc.push(...order.trabajos);
        }
        return acc;
      }, []);
      setAllTrabajosFromDB(allTrabajos);

    } catch (error) {
      console.error("Error fetching source data for request summary report:", error);
      toast({
        title: "Error al Cargar Datos Base",
        description: "No se pudieron obtener las solicitudes o trabajos de Firestore.",
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
    
    const monthlyDataMap: { [key: string]: MonthlySummaryData } = {};

    // Process Solicitudes
    allSolicitudesFromDB.forEach(solicitud => {
      let fechaSolicitudDate: Date | null = null;
      if (solicitud.fechaSolicitud) {
         if (solicitud.fechaSolicitud instanceof Date) fechaSolicitudDate = solicitud.fechaSolicitud;
         else {
            const parsed = new Date(solicitud.fechaSolicitud);
            if(!isNaN(parsed.getTime())) fechaSolicitudDate = parsed;
         }
      }

      if (fechaSolicitudDate && isWithinInterval(fechaSolicitudDate, { start: startDate, end: endDate })) {
        const monthKey = format(fechaSolicitudDate, "yyyy-MM");
        if (!monthlyDataMap[monthKey]) {
          monthlyDataMap[monthKey] = { 
            monthYear: monthKey, 
            monthDisplay: format(fechaSolicitudDate, "MMM yyyy", { locale: es }), 
            solicitudesCreadas: 0, 
            trabajosExitosos: 0 
          };
        }
        monthlyDataMap[monthKey].solicitudesCreadas++;
      }
    });

    // Process Trabajos Exitosos
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
        if (monthlyDataMap[monthKey]) { // Only count if month exists from solicitudes (or create if strict month match not needed)
           monthlyDataMap[monthKey].trabajosExitosos++;
        } else {
          // Optionally, create the month entry if a trabajo exists but no solicitud in that month for the report
          monthlyDataMap[monthKey] = { 
            monthYear: monthKey, 
            monthDisplay: format(fechaFinalizacionDate, "MMM yyyy", { locale: es }), 
            solicitudesCreadas: 0, 
            trabajosExitosos: 1 
          };
        }
      }
    });

    const data = Object.values(monthlyDataMap).sort((a,b) => a.monthYear.localeCompare(b.monthYear));
    setReportData(data);
    
    if (data.length > 0) {
      toast({ title: "Reporte Generado", description: "Resumen mensual de solicitudes calculado con datos reales." });
    } else {
      toast({ title: "Reporte Generado", description: "No se encontraron datos para los filtros seleccionados.", variant: "default" });
    }
    setIsLoadingReport(false);
  };

  if (isLoadingData) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Resumen Mensual de Solicitudes" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Cargando datos base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Resumen Mensual de Solicitudes" />
      <Card>
        <CardHeader>
          <CardTitle>Filtros del Reporte</CardTitle>
          <CardDescription>Seleccione el rango de fechas para el reporte (basado en fecha de solicitud y fecha de finalización del trabajo).</CardDescription>
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
        <CardHeader><CardTitle>Resultados del Reporte</CardTitle></CardHeader>
        <CardContent className="min-h-[300px] bg-muted/20 rounded-md p-0 space-y-4">
          <ScrollArea className="h-[400px]">
            {isLoadingReport && <div className="text-center p-8 flex items-center justify-center h-full"><Icons.loader className="mx-auto h-10 w-10 animate-spin" /><p className="ml-2">Generando reporte...</p></div>}
            {!isLoadingReport && !reportData && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">Seleccione filtros y genere el reporte.</p>}
            {!isLoadingReport && reportData && reportData.length === 0 && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">No hay datos para los filtros seleccionados.</p>}
            {!isLoadingReport && reportData && reportData.length > 0 && (
              <>
                <div className="p-4">
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                        <XAxis dataKey="monthDisplay" tickLine={false} axisLine={false} tickMargin={8} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false}/>
                        <RechartsTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <RechartsLegend content={<ChartLegendContent />} />
                        <Bar dataKey="solicitudesCreadas" fill="var(--color-solicitudesCreadas)" radius={4} />
                        <Bar dataKey="trabajosExitosos" fill="var(--color-trabajosExitosos)" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>Mes</TableHead><TableHead className="text-right">Solicitudes Creadas</TableHead><TableHead className="text-right">Trabajos Exitosos</TableHead><TableHead className="text-right">% Éxito</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {reportData.map(item => (
                    <TableRow key={item.monthYear}>
                      <TableCell>{item.monthDisplay}</TableCell>
                      <TableCell className="text-right">{item.solicitudesCreadas}</TableCell>
                      <TableCell className="text-right">{item.trabajosExitosos}</TableCell>
                      <TableCell className="text-right">{item.solicitudesCreadas > 0 ? ((item.trabajosExitosos / item.solicitudesCreadas) * 100).toFixed(1) + "%" : "N/A"}</TableCell>
                    </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
