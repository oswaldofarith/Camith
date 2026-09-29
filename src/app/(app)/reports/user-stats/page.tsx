
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Icons } from "@/components/icons";
import { format, isWithinInterval, startOfDay, endOfDay, isValid } from "date-fns"; 
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { Trabajo, UserProfile, OrdenDeTrabajo } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getWorkOrders } from "@/services/workOrderService";
import { getUsers } from "@/services/userService";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from 'xlsx';

interface UserStatsData {
  userId: string;
  userName: string;
  trabajosAtendidos: number;
  revisionesComunicacion: number;
  mantenimientos: number;
  instalaciones: number;
  otrosTiposTrabajo: number;
  trabajosCompletados: number;
  trabajosNoCompletados: number;
  efectividad: string; // "N/A" or "XX.X%"
}

export default function UserStatsReportPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<UserStatsData[] | null>(null);
  const { toast } = useToast();

  const [allWorkOrdersFromDB, setAllWorkOrdersFromDB] = useState<OrdenDeTrabajo[]>([]);
  const [allTechniciansFromDB, setAllTechniciansFromDB] = useState<UserProfile[]>([]); // Renamed for clarity
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchSourceData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [fetchedWorkOrders, fetchedUsers] = await Promise.all([
        getWorkOrders(),
        getUsers(),
      ]);
      
      setAllWorkOrdersFromDB(fetchedWorkOrders);
      setAllTechniciansFromDB(fetchedUsers.filter(u => u.perfiles.includes("tecnicoDeCampo"))); 

    } catch (error) {
      console.error("Error fetching source data for user stats report:", error);
      toast({
        title: "Error al Cargar Datos Base",
        description: "No se pudieron obtener los trabajos o usuarios de Firestore.",
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

    const userStatsMap: { [key: string]: UserStatsData } = {};

    // Initialize map for all field technicians
    allTechniciansFromDB.forEach(technician => {
      userStatsMap[technician.id] = {
        userId: technician.id,
        userName: technician.nombre,
        trabajosAtendidos: 0,
        revisionesComunicacion: 0,
        mantenimientos: 0,
        instalaciones: 0,
        otrosTiposTrabajo: 0,
        trabajosCompletados: 0,
        trabajosNoCompletados: 0,
        efectividad: "N/A",
      };
    });
    
    allWorkOrdersFromDB.forEach(order => {
      const techniciansInThisOrder = new Set<string>();
      order.unidadesAsignadas.forEach(ua => {
        ua.tecnicos.forEach(techId => {
          // Ensure the techId corresponds to an actual technician in our pre-filtered list
          if (allTechniciansFromDB.some(t => t.id === techId)) {
            techniciansInThisOrder.add(techId);
          }
        });
      });

      if (techniciansInThisOrder.size === 0) {
        return; // No relevant technicians assigned to this order, skip its trabajos
      }

      order.trabajos.forEach(trabajo => {
        // A trabajo is only considered if it's finalized (has a completion date)
        if (!trabajo.fechaFinalizacion) return;

        let fechaFinalizacionDate: Date | null = null;
        // trabajo.fechaFinalizacion should already be a Date object due to mapOrderDocumentToOrdenDeTrabajo
        if (trabajo.fechaFinalizacion instanceof Date && isValid(trabajo.fechaFinalizacion)) {
          fechaFinalizacionDate = trabajo.fechaFinalizacion;
        }
        // No need to parse from string/number here as service should handle it

        if (fechaFinalizacionDate && isWithinInterval(fechaFinalizacionDate, { start: startDate, end: endDate })) {
          techniciansInThisOrder.forEach(techId => {
            const stats = userStatsMap[techId];
            if (!stats) return; // Should not happen if map initialized correctly

            stats.trabajosAtendidos++;

            if (trabajo.tipoTrabajo === "Revisión de comunicación") stats.revisionesComunicacion++;
            else if (trabajo.tipoTrabajo === "Mantenimiento") stats.mantenimientos++;
            else if (trabajo.tipoTrabajo === "Instalación") stats.instalaciones++;
            else if (trabajo.tipoTrabajo === "Otro") stats.otrosTiposTrabajo++;

            if (trabajo.estado === "Completado") stats.trabajosCompletados++;
            else if (trabajo.estado === "No Completado") stats.trabajosNoCompletados++;
          });
        }
      });
    });

    const data = Object.values(userStatsMap)
      .map(stats => {
        if (stats.trabajosAtendidos > 0) {
          stats.efectividad = ((stats.trabajosCompletados / stats.trabajosAtendidos) * 100).toFixed(1) + "%";
        }
        return stats;
      })
      .filter(stats => stats.trabajosAtendidos > 0) 
      .sort((a, b) => b.trabajosAtendidos - a.trabajosAtendidos || a.userName.localeCompare(b.userName));

    setReportData(data);
    if (data.length > 0) {
      toast({ title: "Reporte Generado", description: "Estadísticas de usuario calculadas." });
    } else {
      toast({ title: "Reporte Generado", description: "No se encontraron datos para los filtros seleccionados.", variant:"default" });
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
      "Usuario": item.userName,
      "Trabajos Atendidos": item.trabajosAtendidos,
      "Rev. Comunicación": item.revisionesComunicacion,
      "Mantenimientos": item.mantenimientos,
      "Instalaciones": item.instalaciones,
      "Otros Trabajos": item.otrosTiposTrabajo,
      "Completados": item.trabajosCompletados,
      "No Completados": item.trabajosNoCompletados,
      "% Efectividad": item.efectividad === "N/A" ? "N/A" : parseFloat(item.efectividad.replace('%','')),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    
    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { 
        const cell_address = {c:8, r:R}; 
        const cell = XLSX.utils.encode_cell(cell_address);
        if (worksheet[cell] && worksheet[cell].v !== "N/A") {
             worksheet[cell].t = 'n';
             worksheet[cell].z = '0.0"%";'; // Format as percentage with one decimal place
             worksheet[cell].v = (worksheet[cell].v as number) / 100; 
        }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "EstadisticasUsuarios");
    
    XLSX.writeFile(workbook, "EstadisticasUsuarios.xlsx");

    toast({
      title: "Exportación Exitosa",
      description: "El reporte ha sido exportado a Excel.",
    });
  };

  if (isLoadingData && !allWorkOrdersFromDB.length) { // Check against allWorkOrdersFromDB
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Reporte: Estadísticas por Usuario" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
           <p className="ml-2">Cargando datos base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reporte: Estadísticas por Usuario" />
      <Card>
        <CardHeader>
          <CardTitle>Filtros del Reporte</CardTitle>
          <CardDescription>Seleccione el rango de fechas para el reporte (basado en Fecha de Finalización del Trabajo).</CardDescription>
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
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Trab. Atendidos</TableHead>
                    <TableHead className="text-right">Rev. Com.</TableHead>
                    <TableHead className="text-right">Mantenim.</TableHead>
                    <TableHead className="text-right">Instalac.</TableHead>
                    <TableHead className="text-right">Otros</TableHead>
                    <TableHead className="text-right">Completados</TableHead>
                    <TableHead className="text-right">No Completados</TableHead>
                    <TableHead className="text-right">% Efectividad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map(stat => (
                    <TableRow key={stat.userId}>
                      <TableCell>{stat.userName}</TableCell>
                      <TableCell className="text-right">{stat.trabajosAtendidos}</TableCell>
                      <TableCell className="text-right">{stat.revisionesComunicacion}</TableCell>
                      <TableCell className="text-right">{stat.mantenimientos}</TableCell>
                      <TableCell className="text-right">{stat.instalaciones}</TableCell>
                      <TableCell className="text-right">{stat.otrosTiposTrabajo}</TableCell>
                      <TableCell className="text-right">{stat.trabajosCompletados}</TableCell>
                      <TableCell className="text-right">{stat.trabajosNoCompletados}</TableCell>
                      <TableCell className="text-right">{stat.efectividad}</TableCell>
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

