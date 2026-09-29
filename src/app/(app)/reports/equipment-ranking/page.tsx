
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link"; // Import Link
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Icons } from "@/components/icons";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { Trabajo, Equipo, OrdenDeTrabajo } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { getEquipos } from "@/services/equipmentService";
import { getWorkOrders } from "@/services/workOrderService";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from 'xlsx';

interface EquipmentRankingData {
  equipoId: string;
  tipoEquipo: Equipo["tipo"];
  revisionesTotales: number;
  revisionesComunicacion: number;
  mantenimientos: number;
}

const ALL_EQUIPMENT_TYPES: Equipo["tipo"][] = ["Colector", "Repetidor", "Medidor"];

export default function EquipmentRankingReportPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date(),
  });
  const [selectedEquipoTipos, setSelectedEquipoTipos] = useState<Equipo["tipo"][]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<EquipmentRankingData[] | null>(null);
  const { toast } = useToast();

  const [allTrabajosFromDB, setAllTrabajosFromDB] = useState<Trabajo[]>([]);
  const [allEquiposFromDB, setAllEquiposFromDB] = useState<Equipo[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchSourceData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [fetchedEquipos, fetchedWorkOrders] = await Promise.all([
        getEquipos(),
        getWorkOrders()
      ]);
      setAllEquiposFromDB(fetchedEquipos);
      
      const allTrabajos = fetchedWorkOrders.reduce((acc: Trabajo[], order: OrdenDeTrabajo) => {
        if (order.trabajos && order.trabajos.length > 0) {
          acc.push(...order.trabajos);
        }
        return acc;
      }, []);
      setAllTrabajosFromDB(allTrabajos);

    } catch (error) {
      console.error("Error fetching source data for report:", error);
      toast({
        title: "Error al Cargar Datos Base",
        description: "No se pudieron obtener los trabajos o equipos de Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSourceData();
  }, [fetchSourceData]);


  const handleEquipoTipoChange = (tipo: Equipo["tipo"]) => {
    setSelectedEquipoTipos(prev =>
      prev.includes(tipo)
        ? prev.filter(s => s !== tipo)
        : [...prev, tipo]
    );
  };

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

    const filteredTrabajos = allTrabajosFromDB.filter(trabajo => {
      const equipoInfo = allEquiposFromDB.find(eq => eq.id === trabajo.equipoId);
      if (!equipoInfo) return false; 

      let fechaFinalizacionDate: Date | null = null;
      if (trabajo.fechaFinalizacion) {
        if (trabajo.fechaFinalizacion instanceof Date) {
          fechaFinalizacionDate = trabajo.fechaFinalizacion;
        } else {
          const parsedDate = new Date(trabajo.fechaFinalizacion);
          if (!isNaN(parsedDate.getTime())) {
            fechaFinalizacionDate = parsedDate;
          }
        }
      }
      
      const isDateInRange = fechaFinalizacionDate && isWithinInterval(fechaFinalizacionDate, { start: startDate, end: endDate });
      const isTypeSelected = selectedEquipoTipos.length === 0 || selectedEquipoTipos.includes(equipoInfo.tipo);
      
      return isDateInRange && isTypeSelected;
    });

    const rankingMap: { [key: string]: EquipmentRankingData } = {};

    filteredTrabajos.forEach(trabajo => {
      const equipoInfo = allEquiposFromDB.find(eq => eq.id === trabajo.equipoId);
      if (!equipoInfo) return; 

      if (!rankingMap[trabajo.equipoId]) {
        rankingMap[trabajo.equipoId] = {
          equipoId: trabajo.equipoId,
          tipoEquipo: equipoInfo.tipo,
          revisionesTotales: 0,
          revisionesComunicacion: 0,
          mantenimientos: 0,
        };
      }
      rankingMap[trabajo.equipoId].revisionesTotales++;
      if (trabajo.tipoTrabajo === "Revisión de comunicación") {
        rankingMap[trabajo.equipoId].revisionesComunicacion++;
      } else if (trabajo.tipoTrabajo === "Mantenimiento") {
        rankingMap[trabajo.equipoId].mantenimientos++;
      }
    });

    allEquiposFromDB.forEach(eq => {
        if ((selectedEquipoTipos.length === 0 || selectedEquipoTipos.includes(eq.tipo)) && !rankingMap[eq.id]) {
            rankingMap[eq.id] = {
                equipoId: eq.id,
                tipoEquipo: eq.tipo,
                revisionesTotales: 0,
                revisionesComunicacion: 0,
                mantenimientos: 0,
            };
        }
    });

    const data = Object.values(rankingMap).sort((a, b) => b.revisionesTotales - a.revisionesTotales || b.revisionesComunicacion - a.revisionesComunicacion || b.mantenimientos - a.mantenimientos);
    
    setReportData(data);
    if (data.length > 0) {
      toast({ title: "Reporte Generado", description: "Ranking de equipos calculado con datos reales." });
    } else {
      toast({ title: "Reporte Generado", description: "No se encontraron datos para los filtros seleccionados.", variant: "default" });
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
      "ID Equipo": item.equipoId,
      "Tipo Equipo": item.tipoEquipo,
      "Revisiones Totales": item.revisionesTotales,
      "Rev. Comunicación": item.revisionesComunicacion,
      "Mantenimientos": item.mantenimientos,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "RankingEquipos");
    
    // Buffer (for later use if needed, e.g., sending to a server)
    // XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    
    // Binary string (for direct download)
    XLSX.writeFile(workbook, "RankingEquipos.xlsx");

    toast({
      title: "Exportación Exitosa",
      description: "El reporte ha sido exportado a Excel.",
    });
  };
  
  if (isLoadingData) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Reporte: Ranking de Equipos por Intervenciones" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Cargando datos base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reporte: Ranking de Equipos por Intervenciones" />
      <Card>
        <CardHeader>
          <CardTitle>Filtros del Reporte</CardTitle>
          <CardDescription>Seleccione los filtros para el reporte. Se usan datos reales de Firestore.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="dateRange" className="block text-sm font-medium mb-1">Rango de Fechas (Trabajos Finalizados)</Label>
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
          </div>
          <div>
            <Label htmlFor="equipoTipo" className="block text-sm font-medium mb-1">Tipo de Equipo</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full md:w-[300px] justify-between">
                   {selectedEquipoTipos.length === 0
                    ? "Todos los tipos"
                    : selectedEquipoTipos.length === 1
                    ? selectedEquipoTipos[0]
                    : `${selectedEquipoTipos.length} tipos seleccionados`}
                  <Icons.chevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Seleccionar Tipos de Equipo</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_EQUIPMENT_TYPES.map((tipo) => (
                  <DropdownMenuCheckboxItem
                    key={tipo}
                    checked={selectedEquipoTipos.includes(tipo)}
                    onCheckedChange={() => handleEquipoTipoChange(tipo)}
                  >
                    {tipo}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
          <ScrollArea className="h-[400px]">
            {isLoadingReport && <div className="text-center p-8 flex items-center justify-center h-full"><Icons.loader className="mx-auto h-10 w-10 animate-spin" /><p className="ml-2">Generando reporte...</p></div>}
            {!isLoadingReport && !reportData && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">Seleccione filtros y genere el reporte.</p>}
            {!isLoadingReport && reportData && reportData.length === 0 && <p className="text-center text-muted-foreground p-8 flex items-center justify-center h-full">No hay datos para los filtros seleccionados.</p>}
            {!isLoadingReport && reportData && reportData.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Equipo</TableHead>
                    <TableHead>Tipo Equipo</TableHead>
                    <TableHead className="text-right">Rev. Totales</TableHead>
                    <TableHead className="text-right">Rev. Comunicación</TableHead>
                    <TableHead className="text-right">Mantenimientos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map(rank => (
                    <TableRow key={rank.equipoId}>
                      <TableCell>
                        <Link href={`/equipment/${rank.equipoId}`} className="text-primary hover:underline">
                          {rank.equipoId}
                        </Link>
                      </TableCell>
                      <TableCell>{rank.tipoEquipo}</TableCell>
                      <TableCell className="text-right">{rank.revisionesTotales}</TableCell>
                      <TableCell className="text-right">{rank.revisionesComunicacion}</TableCell>
                      <TableCell className="text-right">{rank.mantenimientos}</TableCell>
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

