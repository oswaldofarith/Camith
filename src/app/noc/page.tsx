
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icons } from "@/components/icons";
import { DashboardMap, type EquipmentLocationWithInfo } from "@/components/dashboard/DashboardMap";
import { getWorkOrders }from "@/services/workOrderService";
import { getEquipos } from "@/services/equipmentService";
import { getUsers } from "@/services/userService";
import { getVehiculos } from "@/services/vehicleService";
import { getAppSettings } from "@/services/settingsService";
import type { OrdenDeTrabajo, Trabajo, UserProfile, Equipo, Vehiculo, AppSettingsState } from "@/types";
import { isToday, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

interface UnitDailyProgress {
  id: string; // vehicleId
  tipo: Vehiculo['tipo'];
  tecnicos: UserProfile[];
  routeColor?: string; // For visual distinction
  ordenes: {
    id: string;
    displayId: string;
    totalTrabajos: number;
    trabajosCompletados: number;
    trabajosPendientes: number;
    trabajos: Trabajo[];
  }[];
}

interface MapRoute {
  id: string;
  path: google.maps.LatLngLiteral[];
  color: string;
}

const routeColors = [
  "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#A133FF",
  "#33FFF3", "#FFC300", "#C70039", "#900C3F", "#581845"
];

const getInitials = (name?: string): string => {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts[0].length > 0 && parts[parts.length - 1].length > 0) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return "U";
};

export default function NocPage() {
  const { currentUser, isLoading: isAuthLoading } = useAuth();
  const [unitsProgress, setUnitsProgress] = useState<UnitDailyProgress[]>([]);
  const [equipmentForMap, setEquipmentForMap] = useState<EquipmentLocationWithInfo[]>([]);
  const [routesForMap, setRoutesForMap] = useState<MapRoute[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const { toast } = useToast();
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);

  const fetchNocData = useCallback(async () => {
    setIsDataLoading(true);
    try {
      const [
        fetchedWorkOrders,
        fetchedEquipos,
        fetchedUsers,
        fetchedVehiculos,
        fetchedAppSettings,
      ] = await Promise.all([
        getWorkOrders(),
        getEquipos(),
        getUsers(),
        getVehiculos(),
        getAppSettings(),
      ]);

      setAllUsers(fetchedUsers);
      setAppSettings(fetchedAppSettings);
      setAllEquipos(fetchedEquipos);
      
      const todayOrders = fetchedWorkOrders.filter(ot => {
          const creationDate = typeof ot.fechaCreacion === 'string' ? parseISO(ot.fechaCreacion) : ot.fechaCreacion;
          return isToday(creationDate);
      });
      
      const unitsDataMap = new Map<string, UnitDailyProgress>();
      const mapRoutes: MapRoute[] = [];

      todayOrders.forEach((order, index) => {
        const routeColor = routeColors[index % routeColors.length];

        order.unidadesAsignadas.forEach(unidad => {
          const vehicle = fetchedVehiculos.find(v => v.id === unidad.vehiculoId);
          if (!vehicle) return;

          if (!unitsDataMap.has(vehicle.id)) {
            unitsDataMap.set(vehicle.id, {
              id: vehicle.id,
              tipo: vehicle.tipo,
              tecnicos: unidad.tecnicos.map(tid => fetchedUsers.find(u => u.id === tid)).filter(Boolean) as UserProfile[],
              ordenes: [],
              routeColor: routeColor,
            });
          }

          const unitEntry = unitsDataMap.get(vehicle.id)!;
          const trabajosCompletados = order.trabajos.filter(t => t.estado === 'Completado').length;
          const trabajosPendientes = order.trabajos.filter(t => t.estado === 'Pendiente').length;
          
          unitEntry.ordenes.push({
            id: order.id,
            displayId: order.displayId,
            totalTrabajos: order.trabajos.length,
            trabajosCompletados: trabajosCompletados,
            trabajosPendientes: trabajosPendientes,
            trabajos: order.trabajos,
          });
        });
        
        // Process route for map for this order
        const routePath: google.maps.LatLngLiteral[] = [];
        const sedeLat = fetchedAppSettings?.sedeCentralLatitud;
        const sedeLng = fetchedAppSettings?.sedeCentralLongitud;

        if (typeof sedeLat === 'number' && typeof sedeLng === 'number') {
          routePath.push({ lat: sedeLat, lng: sedeLng });
        }
        const sortedTrabajos = [...order.trabajos].sort((a, b) => a.id.localeCompare(b.id));
        sortedTrabajos.forEach(trabajo => {
          const equipo = fetchedEquipos.find(e => e.id === trabajo.equipoId);
          if (equipo?.coordenadas && typeof equipo.coordenadas.latitude === 'number') {
            routePath.push({ lat: equipo.coordenadas.latitude, lng: equipo.coordenadas.longitude });
          }
        });
        if (routePath.length > 1) {
          mapRoutes.push({
            id: order.id,
            path: routePath,
            color: routeColor,
          });
        }
      });


      setUnitsProgress(Array.from(unitsDataMap.values()));
      setRoutesForMap(mapRoutes);

      // --- Map Data ---
      const equipmentInOrders = new Set<string>();
      todayOrders.forEach(order => {
        order.trabajos.forEach(trabajo => equipmentInOrders.add(trabajo.equipoId));
      });

      let mapEquipment: EquipmentLocationWithInfo[] = fetchedEquipos
        .filter(eq => equipmentInOrders.has(eq.id) && eq.coordenadas && typeof eq.coordenadas.latitude === 'number')
        .map(eq => {
            const relevantOrder = todayOrders.find(order => 
                order.trabajos.some(trabajo => trabajo.equipoId === eq.id)
            );
            let ordenInfo: Partial<EquipmentLocationWithInfo> = {};
            if (relevantOrder) {
                const trabajoDelDia = relevantOrder.trabajos.find(t => t.equipoId === eq.id);
                if (trabajoDelDia) {
                    ordenInfo.trabajoDelDia_estado = trabajoDelDia.estado;
                    ordenInfo.ordenDisplayId = relevantOrder.displayId;
                    ordenInfo.trabajoDelDia_tipoTrabajo = trabajoDelDia.tipoTrabajo;
                    ordenInfo.unidadesAsignadas = relevantOrder.unidadesAsignadas;
                    ordenInfo.trabajoDelDia_fechaFinalizacion = trabajoDelDia.fechaFinalizacion;
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
      if (typeof sedeLat === 'number' && typeof sedeLng === 'number') {
          mapEquipment.push({
              id: "sede_central",
              coordenadas: { latitude: sedeLat, longitude: sedeLng },
              tipo: "Sede Central" as any,
              marca: fetchedAppSettings?.empresaNombre || "Sede",
          });
      }
      setEquipmentForMap(mapEquipment);

    } catch (err) {
      console.error("Failed to fetch NOC data:", err);
      toast({
        title: "Error al Cargar Datos",
        description: "No se pudieron obtener los datos para la vista NOC.",
        variant: "destructive",
      });
    } finally {
      setIsDataLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (currentUser) {
      fetchNocData(); // Initial fetch
      const interval = setInterval(fetchNocData, 60000); // Auto-refresh every 60 seconds

      return () => clearInterval(interval);
    }
  }, [currentUser, fetchNocData]);
  
  const getStatusVariant = (status: Trabajo['estado']): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente": return "destructive";
      case "Completado": return "default";
      case "No Completado": return "secondary";
      case "Cancelado": return "secondary";
      default: return "outline";
    }
  };

  const getStatusColorClass = (status: Trabajo['estado']): string => {
    switch (status) {
      case "Pendiente": return "bg-yellow-400 text-yellow-900";
      case "Completado": return "bg-green-500 text-white";
      case "No Completado": return "bg-orange-500 text-white";
      case "Cancelado": return "bg-gray-500 text-white";
      default: return "border";
    }
  };

  if (isAuthLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Cargando Vista NOC...</p>
      </div>
    );
  }

  if (isDataLoading) {
     return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Cargando Vista NOC...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Left Column */}
      <div className="w-1/3 flex flex-col p-4 border-r border-border">
        <h1 className="text-2xl font-bold mb-4 text-primary">Unidades del Día</h1>
        <ScrollArea className="flex-grow">
          <div className="space-y-4 pr-4">
            {unitsProgress.length > 0 ? unitsProgress.map(unit => (
              <Card 
                key={unit.id} 
                className="bg-card"
                style={{ borderLeft: unit.routeColor ? `5px solid ${unit.routeColor}` : 'none' }}
              >
                <CardHeader className="p-3">
                  <CardTitle className="text-lg">Unidad {unit.id}</CardTitle>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {unit.tecnicos.map(tech => (
                      <div key={tech.id} className="flex items-center gap-2 text-sm">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={tech.fotoUrl} alt={tech.nombre}/>
                            <AvatarFallback>{getInitials(tech.nombre)}</AvatarFallback>
                        </Avatar>
                        <span>{tech.nombre}</span>
                      </div>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="p-3 border-t">
                  {unit.ordenes.map(order => (
                    <div key={order.id} className="mb-3">
                      <Link href={`/work-orders/${order.id}`} className="font-semibold text-primary hover:underline text-sm" target="_blank">
                        {order.displayId}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span>{order.trabajosCompletados} Completados</span> / <span>{order.trabajosPendientes} Pendientes</span>
                      </div>
                      <Progress value={(order.totalTrabajos > 0) ? (order.trabajosCompletados / order.totalTrabajos) * 100 : 0} className="h-2 mt-1"/>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )) : <p className="text-muted-foreground text-center pt-10">No hay unidades con órdenes de trabajo para hoy.</p>}
          </div>
        </ScrollArea>
      </div>

      {/* Right Column */}
      <div className="w-2/3 flex flex-col">
        <DashboardMap
          equipmentLocations={equipmentForMap}
          routesToDisplay={routesForMap}
          allUsers={allUsers}
          appSettings={appSettings}
          allEquipos={allEquipos}
        />
      </div>
    </div>
  );
}
