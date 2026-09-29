"use client";

import type React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Icons } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, isSameDay, parseISO, addMinutes, setHours, setMinutes, setSeconds, differenceInMinutes, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { OrdenDeTrabajo, Trabajo, UserProfile, Equipo, Vehiculo, AppSettingsState, GeoPoint, Solicitud } from "@/types";
import { getWorkOrders } from "@/services/workOrderService";
import { getUsers } from "@/services/userService";
import { getVehiculos } from "@/services/vehicleService";
import { getEquipos } from "@/services/equipmentService";
import { getAppSettings } from "@/services/settingsService";
import { getSolicitudes } from "@/services/requestService";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { cn } from "@/lib/utils";


interface GanttTask {
  type: 'task';
  id: string;
  ordenId: string;
  ordenDisplayId: string;
  equipoId: string;
  tipoTrabajo: string;
  estado: Trabajo['estado'];
  startTime: Date;
  endTime: Date;
  duration: number; // in minutes
  urgencia: Solicitud['urgencia'];
  equipo?: Pick<Equipo, 'id' | 'direccion' | 'requiereCanasta' | 'zonaPeligrosa' | 'coordenadas'>;
}

interface GanttTravel {
  type: 'travel';
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number; // in minutes
  originName: string;
  destinationName: string;
  originAddress: string;
  destinationAddress: string;
}

interface GanttLunch {
  type: 'lunch';
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number;
}

type TimelineItem = GanttTask | GanttTravel | GanttLunch;


interface GanttRow {
  unitId: string;
  vehicle: Vehiculo;
  technicians: UserProfile[];
  timelineItems: TimelineItem[];
}

interface GanttOrderGroup {
  ordenId: string;
  ordenDisplayId: string;
  startTime: Date;
  endTime: Date;
}


export default function PlanningBoardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  
  const [ganttData, setGanttData] = useState<GanttRow[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);

  const fetchBoardData = useCallback(async (date: Date) => {
    setIsLoading(true);
    try {
      const [
        fetchedWorkOrders,
        fetchedUsers,
        fetchedVehicles,
        fetchedEquipos,
        fetchedAppSettings,
        fetchedSolicitudes,
      ] = await Promise.all([
        getWorkOrders(),
        getUsers(),
        getVehiculos(),
        getEquipos(),
        getAppSettings(),
        getSolicitudes(),
      ]);

      setAppSettings(fetchedAppSettings);
      const operatingHoursStart = fetchedAppSettings?.operatingHoursStart || "08:00";
      const [startHour, startMinute] = operatingHoursStart.split(':').map(Number);
      const endHour = fetchedAppSettings?.operatingHoursEnd ? parseInt(fetchedAppSettings.operatingHoursEnd.split(':')[0], 10) : 17;
      const planningTime = fetchedAppSettings?.planningTimeMinutes ?? 30;
      
      const lunchTimeMinutes = fetchedAppSettings?.lunchTimeMinutes ?? 60;
      const lunchStartTimeStr = fetchedAppSettings?.lunchStartTime || "12:00";
      const lunchEndTimeStr = fetchedAppSettings?.lunchEndTime || "15:00";

      const sedeCentralCoords: GeoPoint | null = 
        (fetchedAppSettings && typeof fetchedAppSettings.sedeCentralLatitud === 'number' && typeof fetchedAppSettings.sedeCentralLongitud === 'number')
          ? { latitude: fetchedAppSettings.sedeCentralLatitud, longitude: fetchedAppSettings.sedeCentralLongitud }
          : null;
      
      const dayOrders = fetchedWorkOrders.filter(ot => isSameDay(ot.fechaCreacion, date));
      
      const unitsInOrders = new Map<string, { vehicle: Vehiculo; technicians: UserProfile[]; trabajos: Trabajo[]; ordenes: OrdenDeTrabajo[] }>();

      dayOrders.forEach(order => {
        order.unidadesAsignadas.forEach(unit => {
          if (!unitsInOrders.has(unit.vehiculoId)) {
            const vehicle = fetchedVehicles.find(v => v.id === unit.vehiculoId);
            if(vehicle) {
              unitsInOrders.set(unit.vehiculoId, {
                vehicle: vehicle,
                technicians: unit.tecnicos.map(tid => fetchedUsers.find(u => u.id === tid)).filter(Boolean) as UserProfile[],
                trabajos: [],
                ordenes: []
              });
            }
          }
          const unitData = unitsInOrders.get(unit.vehiculoId);
          if (unitData) {
            unitData.trabajos.push(...order.trabajos);
            if (!unitData.ordenes.some(o => o.id === order.id)) {
              unitData.ordenes.push(order);
            }
          }
        });
      });

      const getTravelDuration = async (origin: GeoPoint, destination: GeoPoint): Promise<number> => {
        if (!origin || !destination) return 0;
        const originStr = `${origin.latitude},${origin.longitude}`;
        const destinationStr = `${destination.latitude},${destination.longitude}`;
        
        const url = `/api/directions?origin=${originStr}&destination=${destinationStr}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (response.ok) {
                return data.duration;
            } else {
                console.warn(`[Planning Board] API proxy for directions failed:`, data.error || 'Unknown error');
                return 15; // Fallback to 15 minutes
            }
        } catch (error) {
            console.error("[Planning Board] Error fetching travel time from API proxy:", error);
            return 15; // Fallback to 15 minutes
        }
      };
      
      const newGanttData: GanttRow[] = [];
      for (const [unitId, unitData] of unitsInOrders.entries()) {
        const initialTime = setSeconds(setMinutes(setHours(date, startHour), startMinute), 0);
        let currentTime = addMinutes(initialTime, planningTime);
        const timelineItems: TimelineItem[] = [];
        let previousLocation = sedeCentralCoords;
        let previousLocationDetails = {
            name: fetchedAppSettings?.sedeCentralNombre || fetchedAppSettings?.empresaNombre || "Sede Central",
            address: fetchedAppSettings?.empresaNombre || "Sede Central",
        };
        
        const allJobsForUnit = unitData.ordenes.flatMap(o => 
            o.trabajos.filter(t => unitData.trabajos.some(ut => ut.id === t.id))
        ).sort((a, b) => {
            const ordenA = unitData.ordenes.find(o => o.trabajos.some(t => t.id === a.id))!;
            const ordenB = unitData.ordenes.find(o => o.trabajos.some(t => t.id === b.id))!;
            if (ordenA.displayId !== ordenB.displayId) {
                return ordenA.displayId.localeCompare(ordenB.displayId);
            }
            return (a.solicitudId || a.id).localeCompare(b.solicitudId || b.id);
        });

        for (const trabajo of allJobsForUnit) {
          const equipo = fetchedEquipos.find(e => e.id === trabajo.equipoId);
          if (!equipo?.coordenadas || !previousLocation) continue;
          
          const solicitud = fetchedSolicitudes.find(s => s.id === trabajo.solicitudId);
      
          const travelDuration = await getTravelDuration(previousLocation, equipo.coordenadas);
          
          if (travelDuration > 0) {
            const travelEndTime = addMinutes(currentTime, travelDuration);
            timelineItems.push({
              type: 'travel',
              id: `travel-to-${trabajo.id}`,
              startTime: currentTime,
              endTime: travelEndTime,
              duration: travelDuration,
              originName: previousLocationDetails.name,
              destinationName: equipo.id,
              originAddress: previousLocationDetails.address,
              destinationAddress: equipo.direccion,
            });
            currentTime = travelEndTime;
          }
      
          const taskDuration = trabajo.tiempoServicioEstimado || 60;
          const taskEndTime = addMinutes(currentTime, taskDuration);
          
          const ordenForThisTrabajo = unitData.ordenes.find(o => o.trabajos.some(t => t.id === trabajo.id));

          timelineItems.push({
            type: 'task',
            id: trabajo.id,
            ordenId: ordenForThisTrabajo!.id,
            ordenDisplayId: ordenForThisTrabajo!.displayId,
            equipoId: trabajo.equipoId,
            tipoTrabajo: trabajo.tipoTrabajo,
            estado: trabajo.estado,
            startTime: currentTime,
            endTime: taskEndTime,
            duration: taskDuration,
            urgencia: solicitud?.urgencia || 'Normal',
            equipo: equipo,
          });
          
          currentTime = taskEndTime;
          previousLocation = equipo.coordenadas;
          previousLocationDetails = { name: equipo.id, address: equipo.direccion };
        }

        if (lunchTimeMinutes > 0) {
            const lunchWindowStart = setMinutes(setHours(date, parseInt(lunchStartTimeStr.split(':')[0], 10)), parseInt(lunchStartTimeStr.split(':')[1], 10));
            
            const firstTaskEndingInWindow = timelineItems
                .filter((item): item is GanttTask => item.type === 'task')
                .sort((a,b) => a.endTime.getTime() - b.endTime.getTime())
                .find(item => item.endTime >= lunchWindowStart);

            let lunchStartTime: Date | null = null;
            if (firstTaskEndingInWindow) {
                lunchStartTime = firstTaskEndingInWindow.endTime;
            } else {
                let searchTime = lunchWindowStart;
                const lunchWindowEnd = setMinutes(setHours(date, parseInt(lunchEndTimeStr.split(':')[0], 10)), parseInt(lunchEndTimeStr.split(':')[1], 10));

                while (searchTime < lunchWindowEnd) {
                    const potentialLunchEnd = addMinutes(searchTime, lunchTimeMinutes);
                    if (potentialLunchEnd > lunchWindowEnd) break;

                    const conflict = timelineItems.find(item => 
                        (searchTime < item.endTime && potentialLunchEnd > item.startTime)
                    );

                    if (!conflict) {
                        lunchStartTime = searchTime;
                        break; 
                    }
                    searchTime = conflict.endTime;
                }
            }
            
            if (lunchStartTime) {
                const lunchEndTime = addMinutes(lunchStartTime, lunchTimeMinutes);
                
                const itemsToShift = timelineItems.filter(item => item.startTime >= lunchStartTime!);
                
                for (const item of itemsToShift) {
                    item.startTime = addMinutes(item.startTime, lunchTimeMinutes);
                    item.endTime = addMinutes(item.endTime, lunchTimeMinutes);
                }
                
                timelineItems.push({
                    type: 'lunch',
                    id: `lunch-${unitId}`,
                    startTime: lunchStartTime,
                    endTime: lunchEndTime,
                    duration: lunchTimeMinutes,
                });
            }
        }
        timelineItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        newGanttData.push({
          unitId: unitId,
          vehicle: unitData.vehicle,
          technicians: unitData.technicians,
          timelineItems: timelineItems,
        });
      }

      setGanttData(newGanttData);

    } catch (error) {
      console.error("Error fetching data for planning board:", error);
      toast({
        title: "Error al Cargar Datos",
        description: "No se pudieron obtener los datos para el tablero.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBoardData(selectedDate);
  }, [selectedDate, fetchBoardData]);

  const { timeline, timeMarkers } = useMemo(() => {
    if (!appSettings) return { timeline: [], timeMarkers: [] };

    const start = appSettings.operatingHoursStart ? parseInt(appSettings.operatingHoursStart.split(':')[0], 10) : 8;
    const end = appSettings.operatingHoursEnd ? parseInt(appSettings.operatingHoursEnd.split(':')[0], 10) : 17;
    const hours = [];
    for (let i = start; i <= end; i++) {
      hours.push(i);
    }
    return {
      timeline: hours,
      timeMarkers: [start, end],
    };
  }, [appSettings]);

  const getTimelineItemStyle = (item: TimelineItem, startHour: number): React.CSSProperties => {
    const timelineDuration = timeline[timeline.length - 1] - timeline[0];
    if (timeline.length <= 1 || timelineDuration <= 0) return { left: '0%', width: '0%' };
    
    const ganttViewStartDate = setHours(startOfDay(selectedDate), startHour);
    const totalViewMinutes = timelineDuration * 60;
    
    if (totalViewMinutes <= 0) return { left: '0%', width: '0%' };

    const offsetMinutes = differenceInMinutes(item.startTime, ganttViewStartDate);
    
    const leftPercentage = (offsetMinutes / totalViewMinutes) * 100;
    const widthPercentage = (item.duration / totalViewMinutes) * 100;
    
    return {
      left: `${leftPercentage}%`,
      width: `${widthPercentage}%`,
    };
  };

  const getOrderGroupStyle = (group: GanttOrderGroup, startHour: number): React.CSSProperties => {
    const timelineDuration = timeline[timeline.length - 1] - timeline[0];
    if (timeline.length <= 1 || timelineDuration <= 0) return { left: '0%', width: '0%' };
  
    const ganttViewStartDate = setHours(startOfDay(selectedDate), startHour);
    const totalViewMinutes = timelineDuration > 0 ? timelineDuration * 60 : 0;
    if (totalViewMinutes <= 0) return { left: '0%', width: '0%' };
  
    const offsetMinutes = differenceInMinutes(group.startTime, ganttViewStartDate);
    const groupDurationMinutes = differenceInMinutes(group.endTime, group.startTime);
  
    const leftPercentage = (offsetMinutes / totalViewMinutes) * 100;
    const widthPercentage = (groupDurationMinutes / totalViewMinutes) * 100;
  
    return {
      left: `${leftPercentage}%`,
      width: `${widthPercentage}%`,
    };
  };
  

  const getStatusColorClass = (status: Trabajo['estado']): string => {
    switch (status) {
      case "Pendiente": return "bg-yellow-400/80 border-yellow-500";
      case "Completado": return "bg-green-500/80 border-green-600";
      case "No Completado": return "bg-orange-500/80 border-orange-600";
      case "Cancelado": return "bg-gray-500/80 border-gray-600";
      default: return "bg-slate-400/80 border-slate-500";
    }
  };

  const getTimelineWidth = () => {
    if (timeline.length <= 1) return '100px';
    const duration = timeline[timeline.length - 1] - timeline[0];
    return `${duration * 100}px`; 
  }

  const planningTime = appSettings?.planningTimeMinutes ?? 30;
  const reportingTime = appSettings?.reportingTimeMinutes ?? 60;
  const timelineDurationVal = timeline.length > 1 ? timeline[timeline.length - 1] - timeline[0] : 0;
  const totalViewMinutes = timelineDurationVal > 0 ? timelineDurationVal * 60 : 0;
  
  const planningWidthPercentage = totalViewMinutes > 0 ? (planningTime / totalViewMinutes) * 100 : 0;
  const reportingWidthPercentage = totalViewMinutes > 0 ? (reportingTime / totalViewMinutes) * 100 : 0;
  const reportingLeftPercentage = 100 - reportingWidthPercentage;


  return (
    <div className="flex flex-col gap-6 h-full">
      <PageHeader title="Tablero de Planificación">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
              <Icons.calendar className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
              locale={es}
            />
          </PopoverContent>
        </Popover>
      </PageHeader>

      <Card className="flex-grow flex flex-col">
        <CardContent className="flex-grow overflow-auto p-4">
          <TooltipProvider>
            <div className="relative">
              <div className="flex sticky top-0 bg-background z-10 border-b">
                <div className="w-64 flex-shrink-0 p-2 border-r font-semibold">Unidad</div>
                <div className="flex-grow p-2 relative" style={{minWidth: getTimelineWidth()}}>
                  {timeline.length > 1 && timeline.slice(0, -1).map(hour => {
                      const duration = timeline[timeline.length - 1] - timeline[0];
                      if(duration <= 0) return null;
                      return (
                        <div key={hour} className="absolute top-0 h-full text-center text-xs text-muted-foreground" style={{ left: `${((hour - timeline[0]) / duration) * 100}%`, width: `${100 / duration}%`}}>
                          <div className="border-l h-full pl-1 pt-1">{hour}:00</div>
                        </div>
                      )
                    })
                  }
                </div>
              </div>

              <div className="divide-y">
                {isLoading ? (
                  <div className="flex items-center justify-center p-10"><Icons.loader className="h-8 w-8 animate-spin" /></div>
                ) : ganttData.length === 0 ? (
                  <div className="text-center p-10 text-muted-foreground">No hay trabajos asignados para la fecha seleccionada.</div>
                ) : (
                  ganttData.map(row => {
                    const tasksInRow = row.timelineItems.filter(item => item.type === 'task') as GanttTask[];
                    
                    const tasksByOrder = tasksInRow.reduce((acc, task) => {
                      if (!acc[task.ordenId]) {
                        acc[task.ordenId] = {
                          ordenId: task.ordenId,
                          ordenDisplayId: task.ordenDisplayId,
                          tasks: [],
                        };
                      }
                      acc[task.ordenId].tasks.push(task);
                      return acc;
                    }, {} as Record<string, { ordenId: string; ordenDisplayId: string; tasks: GanttTask[] }>);

                    const orderGroups: GanttOrderGroup[] = Object.values(tasksByOrder).map(group => {
                      const firstTask = group.tasks[0];
                      const lastTask = group.tasks[group.tasks.length - 1];
                      const firstItemIndex = row.timelineItems.findIndex(item => item.type === 'task' && item.id === firstTask.id);
                      const groupStartTime = (firstItemIndex > 0 && row.timelineItems[firstItemIndex - 1].type === 'travel')
                        ? row.timelineItems[firstItemIndex - 1].startTime
                        : firstTask.startTime;
                      const groupEndTime = lastTask.endTime;

                      return {
                        ordenId: group.ordenId,
                        ordenDisplayId: group.ordenDisplayId,
                        startTime: groupStartTime,
                        endTime: groupEndTime,
                      };
                    });

                    return (
                      <div key={row.unitId} className="flex relative hover:z-30">
                        <div className="w-64 flex-shrink-0 p-2 border-r">
                          <p className="font-semibold text-sm">{row.unitId}</p>
                          <p className="text-xs text-muted-foreground">{row.technicians.map(t => t.nombre).join(', ')}</p>
                        </div>
                        <div className="flex-grow p-2 relative" style={{ minWidth: getTimelineWidth(), height: '130px' }}>
                          <div className="absolute h-full top-0 rounded-md p-1 border-dashed border-2 border-muted-foreground/30 bg-muted/20 flex items-center justify-center" style={{ left: `0%`, width: `${planningWidthPercentage}%` }}>
                            <span className="text-xs text-black">Planif.</span>
                          </div>
                          
                          {orderGroups.map(group => (
                            <div key={`group-${group.ordenId}`} className="absolute h-full top-0 z-10" style={getOrderGroupStyle(group, timeline[0])}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Link
                                            href={`/work-orders/${group.ordenId}`}
                                            className="relative block w-full h-full rounded-lg bg-primary/5 dark:bg-primary/10 border-2 border-primary/20 hover:border-primary/40 transition-colors"
                                        >
                                            <span className="absolute top-0.5 left-1.5 text-[10px] font-bold text-primary/80 dark:text-primary-foreground/70">
                                                {group.ordenDisplayId}
                                            </span>
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Ir a la Orden de Trabajo {group.ordenDisplayId}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {format(group.startTime, 'HH:mm')} - {format(group.endTime, 'HH:mm')}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                          ))}

                          {row.timelineItems.map(item => {
                            if (item.type === 'task') {
                              return (
                                <Tooltip key={item.id}>
                                  <TooltipTrigger asChild>
                                    <div
                                      className={cn(
                                        "absolute bottom-2 h-16 rounded-md p-1.5 border text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity z-20",
                                        getStatusColorClass(item.estado)
                                      )}
                                      style={getTimelineItemStyle(item, timeline[0])}
                                    >
                                      <p className="font-semibold whitespace-nowrap text-black">{item.equipoId}</p>
                                      <p className="text-[10px] whitespace-nowrap text-black">{item.tipoTrabajo}</p>
                                      <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                        {item.urgencia === 'Urgente' && (
                                          <div className="bg-white rounded-full p-0.5 shadow" title="Urgente">
                                            <Icons.alertTriangle className="h-3 w-3 text-red-600" />
                                          </div>
                                        )}
                                        {item.equipo?.requiereCanasta && (
                                          <div className="bg-white rounded-full p-0.5 shadow" title="Requiere Canasta">
                                            <Icons.vehicles className="h-3 w-3 text-orange-600" />
                                          </div>
                                        )}
                                        {item.equipo?.zonaPeligrosa && (
                                          <div className="bg-white rounded-full p-0.5 shadow" title="Zona Peligrosa">
                                            <Icons.alertTriangle className="h-3 w-3 text-purple-700" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p><strong>OT:</strong> {item.ordenDisplayId}</p>
                                    <p><strong>Equipo:</strong> {item.equipoId}</p>
                                    <p><strong>Dirección:</strong> {item.equipo?.direccion || 'N/A'}</p>
                                    <p><strong>Tipo Trabajo:</strong> {item.tipoTrabajo}</p>
                                    <p><strong>Estado:</strong> {item.estado}</p>
                                    <p><strong>Horario:</strong> {format(item.startTime, 'HH:mm')} - {format(item.endTime, 'HH:mm')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            } else if (item.type === 'lunch') {
                                return (
                                  <Tooltip key={item.id}>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={cn(
                                          "absolute bottom-2 h-16 rounded-md p-1.5 border text-xs overflow-hidden cursor-pointer hover:opacity-80 transition-opacity z-20 flex items-center justify-center",
                                          "bg-sky-400/80 border-sky-500" 
                                        )}
                                        style={getTimelineItemStyle(item, timeline[0])}
                                      >
                                        <Icons.clock className="h-4 w-4 mr-1 text-black" />
                                        <p className="font-semibold whitespace-nowrap text-black">Almuerzo</p>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p><strong>Almuerzo</strong></p>
                                      <p><strong>Duración:</strong> {item.duration} min</p>
                                      <p><strong>Horario:</strong> {format(item.startTime, 'HH:mm')} - {format(item.endTime, 'HH:mm')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                            } else { 
                              return (
                                <Tooltip key={item.id}>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="absolute bottom-2 h-4 rounded-sm bg-slate-300/70 dark:bg-slate-700/70 border-y border-dashed border-slate-400 dark:border-slate-600 z-20"
                                            style={getTimelineItemStyle(item, timeline[0])}
                                        >
                                          <span className="text-black text-[10px] font-medium absolute inset-0 flex items-center justify-center">
                                            {item.duration > 0 && `${item.duration}m`}
                                          </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p><strong>Traslado:</strong> {item.duration} min</p>
                                      <p className="text-xs text-muted-foreground">{item.originName} &rarr; {item.destinationName}</p>
                                      <div className="text-xs text-muted-foreground border-t mt-1 pt-1 max-w-[200px]">
                                          <p className="truncate" title={item.originAddress}>De: {item.originAddress.length > 30 ? item.originAddress.substring(0,30) + '...' : item.originAddress}</p>
                                          <p className="truncate" title={item.destinationAddress}>A: {item.destinationAddress.length > 30 ? item.destinationAddress.substring(0,30) + '...' : item.destinationAddress}</p>
                                      </div>
                                    </TooltipContent>
                                </Tooltip>
                              );
                            }
                          })}

                          <div className="absolute h-full top-0 rounded-md p-1 border-dashed border-2 border-muted-foreground/30 bg-muted/20 flex items-center justify-center" style={{ left: `${reportingLeftPercentage}%`, width: `${reportingWidthPercentage}%` }}>
                            <span className="text-xs text-black">Reportes</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
