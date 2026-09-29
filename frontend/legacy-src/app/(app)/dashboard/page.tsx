"use client";

import type React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { KpiData as OriginalKpiData, Solicitud, Trabajo, OrdenDeTrabajo, Equipo, GeoPoint, UserProfile, AppSettingsState } from "@/types";
import { getWorkOrders } from "@/services/workOrderService";
import { getSolicitudes } from "@/services/requestService";
import { getEquipos } from "@/services/equipmentService";
import { getUsers } from "@/services/userService";
import { getAppSettings } from "@/services/settingsService";
import { useToast } from "@/hooks/use-toast";
import { isToday, startOfDay, subDays, format as formatDate, eachDayOfInterval, getDay, parseISO, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardMap, type EquipmentLocationWithInfo } from "@/components/dashboard/DashboardMap";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ChartContainer, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface KpiData extends OriginalKpiData {
  trabajosPendientesTotal: number;
  trabajosPendientesCreadosHoy: number;
  trabajosNoCompletadosCreadosHoy: number;
}

interface TrabajoConContexto extends Trabajo {
  ordenDeTrabajoDisplayId: string;
  unidadAsignada?: string;
}

interface MapRoute {
  id: string;
  path: google.maps.LatLngLiteral[];
  color: string;
}

const routeColors = [
  "#FF5733", 
  "#33FF57", 
  "#3357FF", 
  "#FF33A1", 
  "#A133FF", 
  "#33FFF3", 
  "#FF8C33", 
  "#8CFF33", 
];

interface TrendDataPoint {
  name: string; 
  total: number;
}

interface ProportionDataPoint {
  name: string;
  value: number;
  fill: string;
}

interface DailyStatusDataPoint {
  name: string; 
  date: string; 
  Pendientes: number;
  Completados: number;
  NoCompletados: number;
  Cancelados: number;
}

interface DailyUnitProgress {
  ordenId: string;
  ordenDisplayId: string;
  unidades: { vehiculoId: string; tecnicos: UserProfile[] }[];
  completed: number;
  total: number;
}


const dayNamesEs = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const primaryColorHSL = "hsl(217, 63%, 31%)"; 
const secondaryColorHSL = "hsl(198, 30%, 49%)"; 
const accentColorHSL = "hsl(351, 69%, 46%)"; 
const canceladoColorHSL = "hsl(210, 9%, 60%)"; 

const getInitials = (name?: string): string => {
  if (!name || name.trim() === "") return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts[0].length > 0 && parts[parts.length - 1].length > 0) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  } else if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].substring(0, Math.min(2, parts[0].length)).toUpperCase();
  }
  return "U";
};


export default function DashboardPage() {
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [trabajosDelDia, setTrabajosDelDia] = useState<TrabajoConContexto[]>([]);
  const [solicitudesNoAsignadas, setSolicitudesNoAsignadas] = useState<Solicitud[]>([]);
  const [equipmentForMap, setEquipmentForMap] = useState<EquipmentLocationWithInfo[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [processedMapRoutes, setProcessedMapRoutes] = useState<MapRoute[]>([]);
  
  const [ordersTrendData, setOrdersTrendData] = useState<TrendDataPoint[]>([]);
  const [dailyJobStatusTrendData, setDailyJobStatusTrendData] = useState<DailyStatusDataPoint[]>([]); 
  const [jobsProportionData, setJobsProportionData] = useState<ProportionDataPoint[]>([]);
  
  const [dailyUnitsProgress, setDailyUnitsProgress] = useState<DailyUnitProgress[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [mapSelectedDate, setMapSelectedDate] = useState<Date>(new Date());
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);


  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setEquipmentForMap([]); 
      setProcessedMapRoutes([]); 

      try {
        const [fetchedWorkOrders, fetchedSolicitudes, fetchedEquipos, fetchedUsers, fetchedAppSettings] = await Promise.all([
          getWorkOrders(),
          getSolicitudes(),
          getEquipos(),
          getUsers(),
          getAppSettings(),
        ]);

        setAllUsers(fetchedUsers);
        setAppSettings(fetchedAppSettings);
        setAllEquipos(fetchedEquipos);

        const today = new Date();
        
        const sevenDaysAgoForOrders = subDays(today, 6);
        const dateIntervalForOrders = eachDayOfInterval({ start: sevenDaysAgoForOrders, end: today });
        const dailyOrdersCount: Record<string, number> = {};
        dateIntervalForOrders.forEach(date => {
          dailyOrdersCount[formatDate(date, "yyyy-MM-dd")] = 0;
        });
        fetchedWorkOrders.forEach(ot => {
          const otCreationDate = typeof ot.fechaCreacion === 'string' ? parseISO(ot.fechaCreacion) : ot.fechaCreacion;
          if (otCreationDate >= sevenDaysAgoForOrders && otCreationDate <= today) {
            const dateStr = formatDate(otCreationDate, "yyyy-MM-dd");
            if (dailyOrdersCount[dateStr] !== undefined) {
              dailyOrdersCount[dateStr]++;
            }
          }
        });
        const newOrdersTrendData = dateIntervalForOrders.map(date => ({
          name: dayNamesEs[getDay(date)],
          total: dailyOrdersCount[formatDate(date, "yyyy-MM-dd")] || 0,
        }));
        setOrdersTrendData(newOrdersTrendData);

        const tenDaysAgo = subDays(today, 9);
        const dateIntervalForStackedBar = eachDayOfInterval({ start: tenDaysAgo, end: today });
        const dailyStatusMap: Record<string, { Pendientes: number; Completados: number; NoCompletados: number; Cancelados: number }> = {};
        
        dateIntervalForStackedBar.forEach(date => {
            dailyStatusMap[formatDate(date, "yyyy-MM-dd")] = { Pendientes: 0, Completados: 0, NoCompletados: 0, Cancelados: 0 };
        });

        fetchedWorkOrders.forEach(ot => {
            const otCreationDate = typeof ot.fechaCreacion === 'string' ? parseISO(ot.fechaCreacion) : ot.fechaCreacion;
            const otCreationDateStr = formatDate(otCreationDate, "yyyy-MM-dd");

            ot.trabajos.forEach(trabajo => {
                if (trabajo.estado === "Pendiente" && dailyStatusMap[otCreationDateStr]) {
                    if (otCreationDate >= tenDaysAgo && otCreationDate <= today) { 
                       dailyStatusMap[otCreationDateStr].Pendientes++;
                    }
                }

                if (trabajo.fechaFinalizacion) {
                    const finalizacionDate = typeof trabajo.fechaFinalizacion === 'string' ? parseISO(trabajo.fechaFinalizacion) : trabajo.fechaFinalizacion;
                    const finalizacionDateStr = formatDate(finalizacionDate, "yyyy-MM-dd");

                    if (finalizacionDate >= tenDaysAgo && finalizacionDate <= today && dailyStatusMap[finalizacionDateStr]) {
                        if (trabajo.estado === "Completado") {
                            dailyStatusMap[finalizacionDateStr].Completados++;
                        } else if (trabajo.estado === "No Completado") {
                            dailyStatusMap[finalizacionDateStr].NoCompletados++;
                        } else if (trabajo.estado === "Cancelado") {
                            dailyStatusMap[finalizacionDateStr].Cancelados++;
                        }
                    }
                }
            });
        });
        
        const newDailyJobStatusTrendData = dateIntervalForStackedBar.map(date => {
            const dateStr = formatDate(date, "yyyy-MM-dd");
            return {
                name: formatDate(date, "EEE dd/MM", { locale: es }), 
                date: dateStr,
                ...dailyStatusMap[dateStr]
            };
        });
        setDailyJobStatusTrendData(newDailyJobStatusTrendData);


        const ordenesDelDiaCount = fetchedWorkOrders.filter(ot =>
          isToday(typeof ot.fechaCreacion === 'string' ? parseISO(ot.fechaCreacion) : ot.fechaCreacion)
        ).length;

        let trabajosPendientesTotalCount = 0;
        let trabajosCompletadosHoyCount = 0;
        let trabajosPendientesCreadosHoyCount = 0;
        let trabajosNoCompletadosCreadosHoyCount = 0;
        const trabajosPendientesConContexto: TrabajoConContexto[] = [];

        fetchedWorkOrders.forEach(ot => {
          const otCreadaHoy = isToday(typeof ot.fechaCreacion === 'string' ? parseISO(ot.fechaCreacion) : ot.fechaCreacion);
          ot.trabajos.forEach(trabajo => {
            if (trabajo.estado === "Pendiente") {
              trabajosPendientesTotalCount++;
              trabajosPendientesConContexto.push({
                ...trabajo,
                ordenDeTrabajoDisplayId: ot.displayId,
                unidadAsignada: ot.unidadesAsignadas?.[0]?.vehiculoId || "N/A",
              });
              if (otCreadaHoy) {
                trabajosPendientesCreadosHoyCount++;
              }
            }
            if (trabajo.estado === "Completado" && trabajo.fechaFinalizacion && isToday(typeof trabajo.fechaFinalizacion === 'string' ? parseISO(trabajo.fechaFinalizacion) : trabajo.fechaFinalizacion)) {
              trabajosCompletadosHoyCount++;
            }
            if (trabajo.estado === "No Completado" && otCreadaHoy && trabajo.fechaFinalizacion && isToday(typeof trabajo.fechaFinalizacion === 'string' ? parseISO(trabajo.fechaFinalizacion) : trabajo.fechaFinalizacion)) { 
                trabajosNoCompletadosCreadosHoyCount++;
            }
          });
        });

        setKpiData({
          ordenesDelDia: ordenesDelDiaCount,
          trabajosPendientesTotal: trabajosPendientesTotalCount,
          trabajosCompletadosHoy: trabajosCompletadosHoyCount,
          trabajosPendientesCreadosHoy: trabajosPendientesCreadosHoyCount,
          trabajosNoCompletadosCreadosHoy: trabajosNoCompletadosCreadosHoyCount,
        });
        
        const ordenesDeHoy = fetchedWorkOrders.filter(ot =>
            isToday(typeof ot.fechaCreacion === 'string' ? parseISO(ot.fechaCreacion) : ot.fechaCreacion)
        );
        
        const dailyUnitsProgressData: DailyUnitProgress[] = ordenesDeHoy.map(ot => {
            const totalTrabajos = ot.trabajos.length;
            const trabajosCompletados = ot.trabajos.filter(t => t.estado === "Completado").length;
            
            return {
                ordenId: ot.id,
                ordenDisplayId: ot.displayId,
                completed: trabajosCompletados,
                total: totalTrabajos,
                unidades: ot.unidadesAsignadas.map(ua => ({
                    vehiculoId: ua.vehiculoId,
                    tecnicos: ua.tecnicos.map(tid => fetchedUsers.find(u => u.id === tid)).filter(Boolean) as UserProfile[],
                }))
            };
        });
        setDailyUnitsProgress(dailyUnitsProgressData);

        setTrabajosDelDia(trabajosPendientesConContexto.sort((a, b) => a.id.localeCompare(b.id)));
        setSolicitudesNoAsignadas(
          fetchedSolicitudes.filter(s => s.estado === "pendiente")
            .sort((a, b) => new Date(b.fechaSolicitud).getTime() - new Date(a.fechaSolicitud).getTime())
        );

        const ordersForMapDate = fetchedWorkOrders.filter(
          ot => {
            const creationDate = typeof ot.fechaCreacion === 'string' ? parseISO(ot.fechaCreacion) : ot.fechaCreacion;
            return (
              (ot.estadoGeneral === "Pendiente" ||
               ot.estadoGeneral === "En Progreso" ||
               ot.estadoGeneral === "CompletadaParcial" ||
               ot.estadoGeneral === "CompletadaTotal") &&
              isSameDay(creationDate, mapSelectedDate)
            );
          }
        );
        
        const equipmentIdsInOrdersForMap = new Set<string>();
        ordersForMapDate.forEach(order => {
          order.trabajos.forEach(trabajo => {
            equipmentIdsInOrdersForMap.add(trabajo.equipoId);
          });
        });

        let equipmentWithInfoArray: EquipmentLocationWithInfo[] = fetchedEquipos
          .filter(eq =>
            equipmentIdsInOrdersForMap.has(eq.id) &&
            eq.coordenadas &&
            typeof eq.coordenadas.latitude === 'number' &&
            typeof eq.coordenadas.longitude === 'number'
          )
          .map(eq => {
            const relevantOrder = ordersForMapDate.find(order =>
              order.trabajos.some(trabajo => trabajo.equipoId === eq.id)
            );
            let ordenInfo: Partial<EquipmentLocationWithInfo> = {};
            if (relevantOrder) {
              ordenInfo.ordenDisplayId = relevantOrder.displayId;
              ordenInfo.unidadesAsignadas = relevantOrder.unidadesAsignadas;
              const trabajoDelDia = relevantOrder.trabajos.find(t => t.equipoId === eq.id);
              if (trabajoDelDia) {
                ordenInfo.trabajoDelDia_estado = trabajoDelDia.estado;
                ordenInfo.trabajoDelDia_fechaFinalizacion = trabajoDelDia.fechaFinalizacion ? (typeof trabajoDelDia.fechaFinalizacion === 'string' ? parseISO(trabajoDelDia.fechaFinalizacion) : trabajoDelDia.fechaFinalizacion) : undefined;
                ordenInfo.trabajoDelDia_tipoTrabajo = trabajoDelDia.tipoTrabajo;
              }
            }
            return {
              id: eq.id,
              coordenadas: eq.coordenadas,
              tipo: eq.tipo,
              marca: eq.marca,
              ...ordenInfo
            };
          });

        const sedeLat = fetchedAppSettings?.sedeCentralLatitud;
        const sedeLng = fetchedAppSettings?.sedeCentralLongitud;
        const hasValidSedeCoords = typeof sedeLat === 'number' && typeof sedeLng === 'number';

        if (hasValidSedeCoords) {
          const sedeLocationInfo: EquipmentLocationWithInfo = {
            id: "sede_central_marker",
            coordenadas: {
              latitude: sedeLat,
              longitude: sedeLng,
            },
            tipo: "Sede Central" as any,
            marca: fetchedAppSettings?.sedeCentralNombre || fetchedAppSettings?.empresaNombre || "Sede Principal",
          };
          if (!equipmentWithInfoArray.find(e => e.id === "sede_central_marker")) {
            equipmentWithInfoArray.push(sedeLocationInfo);
          }
        }
        setEquipmentForMap(equipmentWithInfoArray);

        const newMapRoutes: MapRoute[] = []; 
        const sedeCoordsForRoute = hasValidSedeCoords
          ? { lat: sedeLat, lng: sedeLng }
          : null;

        ordersForMapDate.forEach((order, index) => {
          const routePath: google.maps.LatLngLiteral[] = [];
          if (sedeCoordsForRoute) {
            routePath.push(sedeCoordsForRoute);
          }
          const sortedTrabajos = [...order.trabajos].sort((a, b) => a.id.localeCompare(b.id));
          sortedTrabajos.forEach(trabajo => {
            const equipo = fetchedEquipos.find(eq => eq.id === trabajo.equipoId);
            if (equipo?.coordenadas && typeof equipo.coordenadas.latitude === 'number' && typeof equipo.coordenadas.longitude === 'number') {
              routePath.push({ lat: equipo.coordenadas.latitude, lng: equipo.coordenadas.longitude });
            }
          });

          if (routePath.length > (sedeCoordsForRoute ? 1 : 0)) {
            newMapRoutes.push({
              id: order.id,
              path: routePath,
              color: routeColors[index % routeColors.length],
            });
          }
        });
        setProcessedMapRoutes(newMapRoutes);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        toast({
          title: "Error al Cargar Datos del Dashboard",
          description: "No se pudieron obtener los datos de Firestore.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [toast, mapSelectedDate]); 

  useEffect(() => {
    if (kpiData) {
      setJobsProportionData([
        { name: "Pendientes (Hoy)", value: kpiData.trabajosPendientesCreadosHoy ?? 0, fill: secondaryColorHSL }, 
        { name: "Completados (Hoy)", value: kpiData.trabajosCompletadosHoy ?? 0, fill: primaryColorHSL }, 
        { name: "No Completados (Hoy)", value: kpiData.trabajosNoCompletadosCreadosHoy ?? 0, fill: accentColorHSL },
      ]);
    }
  }, [kpiData]);

  const handleDonutSegmentClick = (data: any, index: number) => {
    if (data && data.name && data.value !== undefined) {
      toast({
        title: "Detalle del Gráfico",
        description: `${data.name}: ${data.value} trabajo(s)`,
      });
    }
  };

  const getStatusVariant = (status: Trabajo["estado"] | Solicitud["urgencia"] | Solicitud["estado"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente":
      case "pendiente":
      case "Urgente":
        return "destructive";
      case "Completado":
      case "Normal":
      case "asignada":
        return "default";
      case "No Completado":
      case "cancelada":
      case "Cancelado":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusColorClass = (status: Trabajo["estado"] | Solicitud["urgencia"] | Solicitud["estado"]): string => {
    switch (status) {
      case "Pendiente":
      case "pendiente":
        return "bg-yellow-400 text-yellow-900 hover:bg-yellow-500";
      case "Urgente":
        return "bg-red-500 text-white hover:bg-red-600";
      case "Completado":
      case "asignada":
        return "bg-green-500 text-white hover:bg-green-600";
      case "Normal":
        return "bg-blue-500 text-white hover:bg-blue-600";
      case "No Completado":
        return "bg-orange-500 text-white hover:bg-orange-600";
      case "Cancelado": 
      case "cancelada":
        return "bg-gray-500 text-white hover:bg-gray-600";
      default:
        return "border";
    }
  };

  if (isLoading && !kpiData) { 
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Panel de Inicio" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const chartConfigDonut: ChartConfig = {
    "Pendientes (Hoy)": { label: "Pendientes (Hoy)", color: secondaryColorHSL },
    "Completados (Hoy)": { label: "Completados (Hoy)", color: primaryColorHSL },
    "No Completados (Hoy)": { label: "No Completados (Hoy)", color: accentColorHSL },
  };
  
  const chartConfigOrdersCreated: ChartConfig = {
    total: { label: "Total", color: primaryColorHSL },
  };

  const chartConfigDailyJobStatus: ChartConfig = {
    Pendientes: { label: "Pendientes", color: secondaryColorHSL },
    Completados: { label: "Completados", color: primaryColorHSL },
    NoCompletados: { label: "No Completados", color: accentColorHSL },
    Cancelados: { label: "Cancelados", color: canceladoColorHSL },
  };


  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Panel de Inicio">
        <Button asChild variant="outline">
            <Link href="/noc" target="_blank">
                <Icons.tv className="mr-2 h-4 w-4" />
                Abrir Vista NOC
            </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Órdenes Creadas Hoy" value={kpiData?.ordenesDelDia ?? 0} icon={Icons.briefcase} />
        <StatCard title="Trabajos Pendientes (Total)" value={kpiData?.trabajosPendientesTotal ?? 0} icon={Icons.clock} />
        <StatCard title="Trabajos Completados Hoy" value={kpiData?.trabajosCompletadosHoy ?? 0} icon={Icons.checkCircle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle>Mapa de Operaciones</CardTitle>
              <CardDescription>Visualización de equipos y rutas para órdenes de trabajo creadas en la fecha seleccionada.</CardDescription>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                  <Icons.calendar className="mr-2 h-4 w-4" />
                  {mapSelectedDate ? formatDate(mapSelectedDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={mapSelectedDate}
                  onSelect={(date) => setMapSelectedDate(date || new Date())}
                  initialFocus
                  locale={es}
                  disabled={(date) => date > new Date() || date < subDays(new Date(), 30)} 
                />
              </PopoverContent>
            </Popover>
          </CardHeader>
          <CardContent className="h-[400px] p-0">
            {isLoading && equipmentForMap.length === 0 && processedMapRoutes.length === 0 ? (
                 <div className="flex items-center justify-center h-full">
                    <Icons.loader className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2 text-muted-foreground">Cargando mapa...</p>
                  </div>
            ) : (
                <DashboardMap
                equipmentLocations={equipmentForMap}
                routesToDisplay={processedMapRoutes}
                allUsers={allUsers}
                appSettings={appSettings}
                allEquipos={allEquipos}
                />
            )}
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>Progreso del Día</CardTitle>
                <CardDescription>
                    Resumen de trabajos completados por cada orden de trabajo creada hoy.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {dailyUnitsProgress.length > 0 ? dailyUnitsProgress.map(order => (
                        <div key={order.ordenId} className="rounded-md border p-3">
                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="md:col-span-2 space-y-2">
                                    <Link href={`/work-orders/${order.ordenId}`} className="font-semibold text-primary hover:underline">
                                      {order.ordenDisplayId}
                                    </Link>
                                    {order.unidades.length > 0 ? order.unidades.map((unidad, index) => (
                                        <div key={index} className="pl-2">
                                            <p className="text-xs font-medium text-foreground flex items-center gap-2">
                                                <Icons.vehicles className="h-4 w-4 text-muted-foreground" />
                                                Unidad {unidad.vehiculoId}
                                            </p>
                                            <div className="pl-6 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                                {unidad.tecnicos.map(t => (
                                                    <div key={t.id} className="flex items-center gap-2 text-xs">
                                                        <Avatar className="h-5 w-5">
                                                            <AvatarImage src={t.fotoUrl} alt={t.nombre} />
                                                            <AvatarFallback>{getInitials(t.nombre)}</AvatarFallback>
                                                        </Avatar>
                                                        <span>{t.nombre}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )) : <p className="pl-2 text-xs text-muted-foreground italic">Sin unidades asignadas.</p>}
                                </div>
                                <div className="flex flex-col justify-center items-center md:border-l md:pl-4">
                                    <span className="text-xl font-bold">{order.completed} / {order.total}</span>
                                    <p className="text-xs text-muted-foreground">Trabajos Completados</p>
                                    <Progress value={order.total > 0 ? (order.completed / order.total) * 100 : 0} className="w-full h-2 mt-1" />
                                    <p className="text-sm font-semibold mt-1">
                                        {order.total > 0 ? ((order.completed / order.total) * 100).toFixed(1) : "0.0"}%
                                    </p>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="flex items-center justify-center h-32">
                            <p className="text-sm text-muted-foreground">No hay órdenes de trabajo creadas hoy.</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proporción Trabajos del día</CardTitle>
            <CardDescription>Pendientes, Completados y No Completados de OT creadas hoy.</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {jobsProportionData.length > 0 && (kpiData?.trabajosPendientesCreadosHoy || kpiData?.trabajosCompletadosHoy || kpiData?.trabajosNoCompletadosCreadosHoy) ? (
            <ChartContainer config={chartConfigDonut} className="mx-auto aspect-square max-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <RechartsTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
                  <Pie
                    data={jobsProportionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="30%"
                    outerRadius="80%"
                    strokeWidth={5}
                    onClick={handleDonutSegmentClick}
                  >
                    {jobsProportionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/3 [&>*]:justify-center" />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
            ) : (<p className="text-center text-muted-foreground pt-10">No hay datos para mostrar.</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Órdenes Creadas</CardTitle>
            <CardDescription>Últimos 7 días</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            {ordersTrendData.length > 0 ? (
            <ChartContainer config={chartConfigOrdersCreated} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8}/>
                  <RechartsTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            ) : (<p className="text-center text-muted-foreground pt-10">No hay datos para mostrar.</p>)}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Trabajos por día</CardTitle>
            <CardDescription>Estado de trabajos por día de los últimos 10 días.</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
           {dailyJobStatusTrendData.length > 0 ? (
            <ChartContainer config={chartConfigDailyJobStatus} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyJobStatusTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8}/>
                  <RechartsTooltip content={<ChartTooltipContent />} />
                  <RechartsLegend content={<ChartLegendContent />} />
                  <Bar dataKey="Pendientes" stackId="a" fill="var(--color-Pendientes)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Completados" stackId="a" fill="var(--color-Completados)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="NoCompletados" stackId="a" fill="var(--color-NoCompletados)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Cancelados" stackId="a" fill="var(--color-Cancelados)" radius={[0, 0, 4, 4]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
             ) : (<p className="text-center text-muted-foreground pt-10">No hay datos para mostrar.</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trabajos Pendientes (Total)</CardTitle>
            <CardDescription>Listado de todos los trabajos individuales con estado "Pendiente".</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Trabajo</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trabajosDelDia.map((trabajo) => (
                    <TableRow key={trabajo.id}>
                      <TableCell className="text-xs" title={trabajo.ordenDeTrabajoDisplayId}>{trabajo.id}</TableCell>
                      <TableCell>{trabajo.equipoId}</TableCell>
                      <TableCell>{trabajo.unidadAsignada}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(trabajo.estado)} className={getStatusColorClass(trabajo.estado)}>
                          {trabajo.estado}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {trabajosDelDia.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-24">No hay trabajos pendientes.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Solicitudes No Asignadas</CardTitle>
            <CardDescription>Solicitudes que aún no han sido incluidas en una Orden de Trabajo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Solicitud</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Urgencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solicitudesNoAsignadas.map((solicitud) => (
                    <TableRow key={solicitud.id}>
                      <TableCell>{solicitud.displayId || solicitud.id}</TableCell>
                      <TableCell>{solicitud.equipoId}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(solicitud.urgencia)} className={getStatusColorClass(solicitud.urgencia)}>
                          {solicitud.urgencia}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {solicitudesNoAsignadas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center h-24">No hay solicitudes pendientes de asignación.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
