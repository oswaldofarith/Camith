
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Icons } from "@/components/icons";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { OrdenDeTrabajo, UserProfile, Trabajo } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getWorkOrders } from "@/services/workOrderService";
import { getUsers } from "@/services/userService";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import * as XLSX from 'xlsx';

interface WorkOrderSummaryData extends OrdenDeTrabajo {
  totalTrabajos: number;
  trabajosCompletados: number; 
  displayUnidadesAsignadas: string;
}

export default function WorkOrderSummaryReportPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<WorkOrderSummaryData[] | null>(null);
  const { toast } = useToast();

  const [allWorkOrdersFromDB, setAllWorkOrdersFromDB] = useState<OrdenDeTrabajo[]>([]);
  const [allUsersFromDB, setAllUsersFromDB] = useState<UserProfile[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchSourceData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [fetchedWorkOrders, fetchedUsers] = await Promise.all([
        getWorkOrders(),
        getUsers(),
      ]);
      setAllWorkOrdersFromDB(fetchedWorkOrders);
      setAllUsersFromDB(fetchedUsers);
    } catch (error) {
      console.error("Error fetching source data for work order summary:", error);
      toast({
        title: "Error al Cargar Datos Base",
        description: "No se pudieron obtener las órdenes o usuarios de Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSourceData();
  }, [fetchSourceData]);
  
  const getUserName = (userId: string) => allUsersFromDB.find(u => u.id === userId)?.nombre || userId;
  
  const statusDisplayMap: Record<NonNullable<OrdenDeTrabajo["estadoGeneral"]>, string> = {
    "Pendiente": "Pendiente",
    "En Progreso": "En Progreso",
    "CompletadaParcial": "Completada Parcial",
    "CompletadaTotal": "Completada Total",
    "Cancelada": "Cancelada",
  };

  const handleGenerateReport = async () => {
    if (!dateRange || !dateRange.from) {
      toast({ title: "Error", description: "Por favor, seleccione al menos una fecha de inicio.", variant: "destructive" });
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
    const endDate = to ? endOfDay(to) : endOfDay(new Date()); 

    const filteredOrders = allWorkOrdersFromDB.filter(ot => {
      const otDate = new Date(ot.fechaCreacion); 
      return isWithinInterval(otDate, { start: startDate, end: endDate });
    });

    const data = filteredOrders
      .map(ot => {
        const displayUnidades = ot.unidadesAsignadas.map(ua => 
          `Unidad ${ua.vehiculoId}: ${ua.tecnicos.map(getUserName).join(', ') || 'Sin técnicos'}`
        ).join('; ');

        return {
          ...ot,
          totalTrabajos: ot.trabajos?.length || 0,
          trabajosCompletados: ot.trabajos?.filter(t => t.estado === "Completado").length || 0,
          displayUnidadesAsignadas: displayUnidades || "Ninguna",
        };
      })
      .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime());
      
    setReportData(data);
    if (data.length > 0) {
        toast({ title: "Reporte Generado", description: "Resumen de órdenes de trabajo calculado con datos reales." });
    } else {
        toast({ title: "Reporte Generado", description: "No se encontraron órdenes para los filtros seleccionados.", variant: "default" });
    }
    setIsLoadingReport(false);
  };

  const handleExportToExcel = () => {
    if (!reportData || reportData.length === 0) {
      toast({
        title: "Sin Datos para Exportar",
        description: "Genere un reporte primero o no hay datos con los filtros actuales.",
        variant: "default",
      });
      return;
    }

    const dataForExcel = reportData.map(item => ({
      "ID Orden": item.displayId,
      "Fecha Creación": format(new Date(item.fechaCreacion), "dd/MM/yyyy HH:mm"),
      "Creado Por": getUserName(item.creadoPor),
      "Estado": statusDisplayMap[item.estadoGeneral as NonNullable<OrdenDeTrabajo["estadoGeneral"]>] || item.estadoGeneral || "No definido",
      "# Trabajos": item.totalTrabajos,
      "Unidades Asignadas": item.displayUnidadesAsignadas,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ResumenOrdenesTrabajo");
    
    XLSX.writeFile(workbook, "ResumenOrdenesTrabajo.xlsx");

    toast({
      title: "Exportación Exitosa",
      description: "El reporte ha sido exportado a Excel.",
    });
  };
  
  const getStatusVariant = (status?: OrdenDeTrabajo["estadoGeneral"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente": return "destructive";
      case "En Progreso": return "default"; 
      case "CompletadaTotal": return "default";
      case "CompletadaParcial": return "secondary";
      case "Cancelada": return "secondary";
      default: return "outline";
    }
  };
   const getStatusColorClass = (status?: OrdenDeTrabajo["estadoGeneral"]): string => {
    switch (status) {
      case "Pendiente": return "bg-yellow-400 text-yellow-900";
      case "En Progreso": return "bg-blue-500 text-white";
      case "CompletadaTotal": return "bg-green-500 text-white";
      case "CompletadaParcial": return "bg-teal-500 text-white";
      case "Cancelada": return "bg-slate-500 text-white";
      default: return "border";
    }
  };
  
  if (isLoadingData) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Reporte: Resumen de Órdenes de Trabajo" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Cargando datos base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reporte: Resumen de Órdenes de Trabajo" />
      <Card>
        <CardHeader>
          <CardTitle>Filtros del Reporte</CardTitle>
          <CardDescription>Seleccione el rango de fechas (basado en Fecha de Creación de la Orden).</CardDescription>
        </CardHeader>
        <CardContent>
          <label htmlFor="dateRange" className="block text-sm font-medium mb-1">Rango de Fechas de Creación</label>
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
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Resultados del Reporte</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportToExcel} disabled={!reportData || reportData.length === 0 || isLoadingReport}>
                <Icons.excel className="mr-2 h-4 w-4" />
                Exportar
            </Button>
        </CardHeader>
        <CardContent className="min-h-[200px] bg-muted/20 rounded-md p-0">
           <ScrollArea className="h-[500px]">
            {isLoadingReport && <div className="text-center p-8 flex items-center justify-center h-full"><Icons.loader className="mx-auto h-10 w-10 animate-spin" /><p className="ml-2">Generando reporte...</p></div>}
            {!isLoadingReport && !reportData && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">Seleccione filtros y genere el reporte.</p>}
            {!isLoadingReport && reportData && reportData.length === 0 && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">No hay datos para los filtros seleccionados.</p>}
            {!isLoadingReport && reportData && reportData.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Orden</TableHead>
                    <TableHead>Fecha Creación</TableHead>
                    <TableHead>Creado Por</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right"># Trabajos</TableHead>
                    <TableHead>Unidades Asignadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map(ot => (
                    <TableRow key={ot.id}>
                      <TableCell>{ot.displayId}</TableCell>
                      <TableCell>{format(new Date(ot.fechaCreacion), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>{getUserName(ot.creadoPor)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(ot.estadoGeneral)} className={getStatusColorClass(ot.estadoGeneral)}>
                           {statusDisplayMap[ot.estadoGeneral as NonNullable<OrdenDeTrabajo["estadoGeneral"]>] || ot.estadoGeneral || "No definido"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{ot.totalTrabajos}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={ot.displayUnidadesAsignadas}>{ot.displayUnidadesAsignadas}</TableCell>
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

