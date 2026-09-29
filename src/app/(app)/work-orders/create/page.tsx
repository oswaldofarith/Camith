
"use client";

import type React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation"; 
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons"; 
import type { UnidadDeCampo, Solicitud, Vehiculo, UserProfile, OrdenDeTrabajo, Equipo as EquipoType, AppSettingsState, TipoTrabajoDetallado } from "@/types"; 
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { format, addMinutes, setHours, setMinutes, setSeconds, differenceInMinutes, startOfDay } from "date-fns";
import { es } from 'date-fns/locale';
import { getSolicitudes, addSolicitud, getPendingRequestForEquipment, deleteSolicitud } from "@/services/requestService";
import { getSavedFieldUnitCompositions } from "@/services/fieldUnitService";
import { getVehiculos } from "@/services/vehicleService";
import { getUsers } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { createWorkOrdersBatch } from "@/services/workOrderService";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getEquipos } from "@/services/equipmentService";
import { getAppSettings } from "@/services/settingsService";
import type { AssignRoutesAIInput, AssignRoutesAIOutput } from '@/types';
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DraggableRequestCardProps {
  request: Solicitud;
  equipoDetails?: Pick<EquipoType, 'id' | 'marca' | 'zona' | 'requiereCanasta' | 'zonaPeligrosa'>;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, requestId: string) => void;
}

interface TimelineTask {
  type: 'task';
  id: string; 
  solicitud: Solicitud;
  equipoDetails?: Pick<EquipoType, 'id' | 'direccion' | 'requiereCanasta' | 'zonaPeligrosa' | 'coordenadas' | 'zona'>;
  startTime: Date;
  endTime: Date;
  duration: number; 
}

interface TimelineFixedBlock {
  type: 'planning' | 'lunch' | 'reporting';
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number;
}
type TimelineItem = TimelineTask | TimelineFixedBlock;

interface RouteWithTimeline {
  id: string;
  name: string;
  requests: Solicitud[];
  assignedUnits: string[];
  timelineItems: TimelineItem[];
  timelineErrors: string[];
}

function DraggableRequestCard({ request, equipoDetails, onDragStart }: DraggableRequestCardProps) {
  const marca = equipoDetails?.marca || "Desconocida";
  const zona = equipoDetails?.zona || "Desconocida";
  const requiereCanasta = equipoDetails?.requiereCanasta;
  const esZonaPeligrosa = equipoDetails?.zonaPeligrosa;

  return (
    <Card
      draggable={true}
      onDragStart={(e) => onDragStart(e, request.id)}
      className="mb-2 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
    >
      <CardContent className="p-3 min-h-[6rem] relative">
        <p className="text-xs font-semibold pr-10">{request.equipoId} ({request.displayId || request.id.substring(0,5)})</p>
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {request.urgencia === 'Urgente' && <Icons.alertTriangle className="h-4 w-4 text-red-600" />}
          {requiereCanasta && <Icons.vehicles className="h-4 w-4 text-orange-600" />}
          {esZonaPeligrosa && <Icons.alertTriangle className="h-4 w-4 text-purple-700" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1 mb-2 truncate" title={request.descripcion}>{request.descripcion || "Sin descripción"}</p>
        <div className="flex gap-1 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{marca}</Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{zona === 'ViaCosta' ? 'Vía a la Costa' : zona}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickRequestDialog({ open, onClose, onSaveSuccess, appSettings, allEquipos, setRequestConflict }: any) {
    const { currentUser } = useAuth();
    const { toast } = useToast();
    const [equipo, setEquipo] = useState("");
    const [tipoTrabajo, setTipoTrabajo] = useState("");
    const [urgencia, setUrgencia] = useState("Normal");
    const [descripcion, setDescripcion] = useState("");
    const [fechaProgramada] = useState<Date | undefined>(new Date());
    const [availableTrabajos, setAvailableTrabajos] = useState<TipoTrabajoDetallado[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const equipoOptions = useMemo(() => allEquipos.filter((e: any) => e.estado === "Activo").map((e: any) => ({ value: e.id, label: `${e.id} (${e.marca})` })), [allEquipos]);

    useEffect(() => {
        if (equipo && appSettings) {
            const eq = allEquipos.find((e: any) => e.id === equipo);
            const typeConfig = appSettings.tiposEquipos.find((te: any) => te.value === eq?.tipo);
            setAvailableTrabajos(typeConfig?.tiposDeTrabajoAsociados || []);
        }
    }, [equipo, appSettings, allEquipos]);

    const handleSubmit = async () => {
        if (!equipo || !tipoTrabajo || !currentUser) {
            toast({ title: "Validación", description: "Equipo y tipo de trabajo son requeridos.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        
        const eqDetails = allEquipos.find((e: any) => e.id === equipo);
        const tipoEqConfig = appSettings.tiposEquipos.find((te: any) => te.value === eqDetails?.tipo);
        const trabajoConfig = tipoEqConfig?.tiposDeTrabajoAsociados.find((tt: any) => tt.id === tipoTrabajo);

        const payload = { 
            equipoId: equipo, 
            tipoTrabajo, 
            urgencia, 
            descripcion: descripcion.trim(), 
            creadoPor: currentUser.uid, 
            fechaProgramada: fechaProgramada || new Date(),
            tiempoServicioEstimado: trabajoConfig?.tiempoEstimadoMinutos || 60
        };

        try {
            const existing = await getPendingRequestForEquipment(equipo);
            if (existing) {
                setRequestConflict({ 
                    existing, 
                    onConfirm: async () => { 
                        await deleteSolicitud(existing.id); 
                        const r = await addSolicitud(payload as any); 
                        onSaveSuccess(r); 
                        onClose(); 
                        setEquipo(""); setTipoTrabajo(""); setDescripcion("");
                    } 
                });
            } else {
                const r = await addSolicitud(payload as any);
                onSaveSuccess(r);
                onClose();
                setEquipo(""); setTipoTrabajo(""); setDescripcion("");
            }
        } catch (e) { 
            toast({ title: "Error al crear solicitud rápida", description: (e as Error).message, variant: "destructive" }); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader><DialogTitle>Solicitud Rápida</DialogTitle><DialogDescription>Añade un trabajo pendiente directamente al tablero.</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Equipo</Label>
                        <Combobox options={equipoOptions} value={equipo} onValueChange={setEquipo} placeholder="Seleccionar equipo..."/>
                    </div>
                    <div className="space-y-2">
                        <Label>Tipo de trabajo</Label>
                        <Select value={tipoTrabajo} onValueChange={setTipoTrabajo} disabled={!equipo}>
                            <SelectTrigger><SelectValue placeholder="Seleccionar tipo..."/></SelectTrigger>
                            <SelectContent>{availableTrabajos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre} ({t.tiempoEstimadoMinutos} min)</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Urgencia</Label>
                        <Select value={urgencia} onValueChange={setUrgencia}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Normal">Normal</SelectItem>
                                <SelectItem value="Urgente">Urgente</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Descripción</Label>
                        <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional..." rows={2}/>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin"/>} Crear</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function CreateWorkOrderPage() {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const router = useRouter(); 
  const [currentStep, setCurrentStep] = useState(1);
  const [modifiableUnits, setModifiableUnits] = useState<UnidadDeCampo[]>([]);
  const [pendingRequestsState, setPendingRequestsState] = useState<Solicitud[]>([]);
  const [routes, setRoutes] = useState<RouteWithTimeline[]>([{ id: `route${Date.now()}`, name: "Ruta 1", requests: [], assignedUnits: [], timelineItems: [], timelineErrors: [] }]);
  const [isPendingPanelCollapsed, setIsPendingPanelCollapsed] = useState(false);
  const [allVehicles, setAllVehicles] = useState<Vehiculo[]>([]); 
  const [allEquiposDetails, setAllEquiposDetails] = useState<EquipoType[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiAssigning, setIsAiAssigning] = useState(false);
  const [isQuickRequestModalOpen, setIsQuickRequestModalOpen] = useState(false);
  const [requestConflict, setRequestConflict] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedSolicitudes, fetchedSavedCompositions, fetchedVehicles, fetchedUsers, fetchedEquipos, fetchedAppSettings] = await Promise.all([
        getSolicitudes(), getSavedFieldUnitCompositions(), getVehiculos(), getUsers(), getEquipos(), getAppSettings()
      ]);
      setAllEquiposDetails(fetchedEquipos);
      setAppSettings(fetchedAppSettings);
      setPendingRequestsState(fetchedSolicitudes.filter(s => s.estado === 'pendiente'));
      const availableVehicles = fetchedVehicles.filter(v => v.estado === 'disponible');
      setAllVehicles(availableVehicles);
      const units = availableVehicles.map(v => {
          const comp = fetchedSavedCompositions.find(c => c.vehiculoId === v.id);
          return { id: v.id, vehiculoId: v.id, tecnicos: comp ? comp.tecnicos : [] };
      });
      setModifiableUnits(units);
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const timeline = useMemo(() => {
    if (!appSettings) return [];
    const start = parseInt((appSettings.operatingHoursStart || "08:00").split(':')[0], 10);
    const end = parseInt((appSettings.operatingHoursEnd || "17:00").split(':')[0], 10);
    const hours = [];
    for (let i = start; i <= end; i++) hours.push(i);
    return hours;
  }, [appSettings]);

  const updateRoutesWithTimelines = useCallback(async (currentRoutes: RouteWithTimeline[]) => {
    if (!appSettings) return currentRoutes;
    const [startHour, startMinute] = (appSettings.operatingHoursStart || "08:00").split(':').map(Number);
    const planningTime = appSettings.planningTimeMinutes ?? 30;
    return Promise.all(currentRoutes.map(async (route) => {
      let currentTime = addMinutes(setHours(setMinutes(new Date(), startMinute), startHour), 0);
      const timelineItems: TimelineItem[] = [{ type: 'planning', id: `p-${route.id}`, startTime: currentTime, endTime: addMinutes(currentTime, planningTime), duration: planningTime }];
      currentTime = addMinutes(currentTime, planningTime);
      for (const req of route.requests) {
        const equipo = allEquiposDetails.find(e => e.id === req.equipoId);
        const taskDuration = req.tiempoServicioEstimado || 60;
        timelineItems.push({ type: 'task', id: req.id, solicitud: req, equipoDetails: equipo, startTime: currentTime, endTime: addMinutes(currentTime, taskDuration), duration: taskDuration });
        currentTime = addMinutes(currentTime, taskDuration);
      }
      return { ...route, timelineItems, timelineErrors: [] };
    }));
  }, [appSettings, allEquiposDetails]);

  const handleAiAssignment = async () => {
    if (!appSettings?.sedeCentralLatitud) {
        toast({ title: "Error", description: "La sede central no está configurada.", variant: "destructive" });
        return;
    }
    setIsAiAssigning(true);
    const aiPayload: AssignRoutesAIInput = {
      sedeCentral: { lat: appSettings.sedeCentralLatitud!, lon: appSettings.sedeCentralLongitud! },
      solicitudesPendientes: pendingRequestsState.map(req => ({ id: req.id, equipoId: req.equipoId, urgencia: req.urgencia, tiempoServicioEstimado: req.tiempoServicioEstimado || 60 })),
      equipos: allEquiposDetails.map(eq => ({ id: eq.id, coordenadas: eq.coordenadas, requiereCanasta: eq.requiereCanasta, zonaPeligrosa: eq.zonaPeligrosa })),
      unidadesDisponibles: modifiableUnits.map(u => ({ id: u.id, tipoVehiculo: allVehicles.find(v => v.id === u.vehiculoId)?.tipo || 'N/A', tecnicos: [] })),
      rutasExistentes: routes.map(r => ({ nombreRuta: r.name, solicitudesAsignadas: r.requests.map(req => ({ id: req.id, equipoId: req.equipoId, urgencia: req.urgencia, tiempoServicioEstimado: req.tiempoServicioEstimado || 60 })), unidadesAsignadas: r.assignedUnits.map(uid => ({ id: uid, tipoVehiculo: 'N/A', tecnicos: [] })) })),
      operatingHoursStart: appSettings.operatingHoursStart || "08:00", operatingHoursEnd: appSettings.operatingHoursEnd || "17:00",
      planningTimeMinutes: appSettings.planningTimeMinutes || 30, lunchTimeMinutes: appSettings.lunchTimeMinutes || 60, reportingTimeMinutes: appSettings.reportingTimeMinutes || 60,
    };

    try {
      const resp = await fetch('/api/ai/assign-routes', { method: 'POST', body: JSON.stringify(aiPayload) });
      if (!resp.ok) throw new Error("Fallo en la llamada a la IA.");
      const result: AssignRoutesAIOutput = await resp.json();
      
      const formatZones = (reqs: Solicitud[]) => {
          const zones = Array.from(new Set(reqs.map(r => {
              const eq = allEquiposDetails.find(e => e.id === r.equipoId);
              let z = eq?.zona;
              if (z === 'ViaCosta') return 'Vía a la Costa';
              return z;
          }).filter(Boolean)));
          
          if (zones.length === 0) return "";
          if (zones.length === 1) return ` - ${zones[0]}`;
          if (zones.length === 2) return ` - ${zones[0]} y ${zones[1]}`;
          
          const lastZone = zones.pop();
          return ` - ${zones.join(", ")} y ${lastZone}`;
      };

      const newRoutes = result.rutas.map((aiR, idx) => {
          const reqs = aiR.solicitudesAsignadas.map(id => {
              let found = pendingRequestsState.find(r => r.id === id);
              if (!found) {
                  for (const r of routes) {
                      found = r.requests.find(item => item.id === id);
                      if (found) break;
                  }
              }
              return found;
          }).filter(Boolean) as Solicitud[];
          
          return { 
              id: `route-${idx}`, 
              name: `Ruta ${idx + 1}${formatZones(reqs)}`, 
              requests: reqs, 
              assignedUnits: aiR.unidadesAsignadas, 
              timelineItems: [], 
              timelineErrors: [] 
          };
      });

      if (newRoutes.length === 0) {
          setRoutes([{ id: `route${Date.now()}`, name: "Ruta 1", requests: [], assignedUnits: [], timelineItems: [], timelineErrors: [] }]);
      } else {
          const recalculated = await updateRoutesWithTimelines(newRoutes);
          setRoutes(recalculated);
          const assignedIds = new Set(newRoutes.flatMap(r => r.requests.map(req => req.id)));
          setPendingRequestsState(prev => prev.filter(r => !assignedIds.has(r.id)));
          if (pendingRequestsState.length <= assignedIds.size) setIsPendingPanelCollapsed(true);
      }
      toast({ title: "Asignación Completada", description: "La IA ha organizado las rutas eficientemente." });
    } catch (e) { 
        toast({ title: "Error en IA", description: (e as Error).message, variant: "destructive" }); 
    } finally { 
        setIsAiAssigning(false); 
    }
  };

  const handleDragStart = (e: React.DragEvent, requestId: string) => { e.dataTransfer.setData("requestId", requestId); };

  const handleDrop = async (e: React.DragEvent, targetRouteId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("requestId");
    const req = pendingRequestsState.find(r => r.id === id);
    if (!req) return;
    const newRoutes = routes.map(r => r.id === targetRouteId ? { ...r, requests: [...r.requests, req] } : r);
    setRoutes(await updateRoutesWithTimelines(newRoutes));
    setPendingRequestsState(prev => prev.filter(r => r.id !== id));
    if (pendingRequestsState.length === 1) setIsPendingPanelCollapsed(true);
  };

  const handleRemoveRequestFromRoute = async (requestId: string, routeId: string) => {
    const route = routes.find(r => r.id === routeId);
    const req = route?.requests.find(r => r.id === requestId);
    if (!req) return;
    const newRoutes = routes.map(r => r.id === routeId ? { ...r, requests: r.requests.filter(item => item.id !== requestId) } : r);
    setRoutes(await updateRoutesWithTimelines(newRoutes));
    setPendingRequestsState(prev => [...prev, req].sort((a,b) => new Date(a.fechaProgramada).getTime() - new Date(b.fechaProgramada).getTime()));
    setIsPendingPanelCollapsed(false);
  };

  const getTimelineItemStyle = (item: TimelineItem, startHour: number): React.CSSProperties => {
    const totalViewMinutes = (timeline[timeline.length-1] - timeline[0]) * 60;
    if (totalViewMinutes <= 0) return { left: '0%', width: '0%' };
    const offset = differenceInMinutes(item.startTime, setHours(startOfDay(new Date()), startHour));
    return { left: `${(offset / totalViewMinutes) * 100}%`, width: `${(item.duration / totalViewMinutes) * 100}%` };
  };

  if (isLoading) return <div className="p-10 text-center"><Icons.loader className="animate-spin inline mr-2"/> Cargando datos...</div>;

  return (
    <div className="flex flex-col gap-6 h-full">
      <PageHeader title={`Crear Orden - Paso ${currentStep}/3`} />
      
      {currentStep === 1 && (
        <Card><CardContent className="space-y-4 p-6">
          <CardDescription>Paso 1: Verifique las unidades de campo para hoy.</CardDescription>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {modifiableUnits.map(unit => (
                  <div key={unit.id} className="p-4 border rounded-lg bg-muted/20">
                      <Label className="font-bold">{unit.vehiculoId}</Label>
                      <p className="text-xs text-muted-foreground mt-1">Técnicos: {unit.tecnicos.length}</p>
                  </div>
              ))}
          </div>
          <Button className="w-full" onClick={() => setCurrentStep(2)}>Continuar al Paso 2</Button>
        </CardContent></Card>
      )}

      {currentStep === 2 && (
        <div className={cn("grid gap-6 h-full transition-all duration-300", !isPendingPanelCollapsed ? "grid-cols-[320px_1fr]" : "grid-cols-1")}>
          {!isPendingPanelCollapsed && (
            <Card className="flex flex-col h-full border-primary/20">
              <CardHeader className="flex-row justify-between items-center space-y-0 pb-4">
                <CardTitle className="text-lg">Pendientes ({pendingRequestsState.length})</CardTitle>
                <div className="flex gap-1">
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsQuickRequestModalOpen(true)}><Icons.add className="h-4 w-4"/></Button>
                    </TooltipTrigger><TooltipContent>Solicitud Rápida</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsPendingPanelCollapsed(true)}><Icons.chevronLeft className="h-4 w-4"/></Button>
                    </TooltipTrigger><TooltipContent>Ocultar Panel</TooltipContent></Tooltip></TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="flex-grow p-2">
                <ScrollArea className="h-[calc(100vh-320px)]">
                    <div className="pr-3">
                        {pendingRequestsState.map(r => <DraggableRequestCard key={r.id} request={r} onDragStart={handleDragStart} equipoDetails={allEquiposDetails.find(e => e.id === r.equipoId)}/>)}
                    </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <Card className="flex flex-col h-full">
            <CardHeader className="flex-row justify-between items-center space-y-0 border-b">
                <div className="flex items-center gap-3">
                    {isPendingPanelCollapsed && <Button variant="outline" size="sm" onClick={() => setIsPendingPanelCollapsed(false)}><Icons.chevronRight className="mr-1 h-4 w-4"/> Mostrar Solicitudes</Button>}
                    <CardTitle className="text-lg">Rutas y Asignación</CardTitle>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={handleAiAssignment} disabled={isAiAssigning}>{isAiAssigning ? <Icons.loader className="animate-spin mr-2 h-4 w-4"/> : <Icons.activity className="mr-2 h-4 w-4"/>} Asignar con IA</Button>
                    <Button size="sm" onClick={() => setCurrentStep(3)}>Finalizar</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
                <div className="min-w-[900px] flex flex-col">
                    <div className="flex border-b bg-muted/30 sticky top-0 z-20">
                        <div className="w-56 flex-shrink-0 p-2 border-r font-bold text-xs">Unidad</div>
                        <div className="flex-grow relative h-10">
                            {timeline.slice(0,-1).map(hour => (
                                <div key={hour} className="absolute h-full border-l text-[10px] text-muted-foreground pl-1" style={{ left: `${((hour - timeline[0]) / (timeline[timeline.length-1]-timeline[0])) * 100}%` }}>{hour}:00</div>
                            ))}
                        </div>
                    </div>
                    <ScrollArea className="h-[calc(100vh-320px)]">
                        <div className="divide-y">
                            {routes.map(r => (
                                <div key={r.id} className="flex min-h-[100px]" onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, r.id)}>
                                    <div className="w-56 flex-shrink-0 p-3 border-r bg-muted/10"><p className="font-bold text-sm text-primary">{r.name}</p></div>
                                    <div className="flex-grow relative p-2">
                                        {r.timelineItems.map(item => {
                                            if (item.type === 'task') {
                                                const req = item.solicitud;
                                                const eq = item.equipoDetails;
                                                return (
                                                    <TooltipProvider key={item.id}><Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="absolute bottom-4 h-14 bg-yellow-400 border border-yellow-600 rounded-md shadow-sm p-2 text-[10px] overflow-hidden z-10" style={getTimelineItemStyle(item, timeline[0])}>
                                                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-4 w-4 p-0" onClick={() => handleRemoveRequestFromRoute(item.id, r.id)}>
                                                                    <div className="bg-white rounded-full p-0.5 border border-yellow-600"><Icons.x className="h-2 w-2 text-yellow-600"/></div>
                                                                </Button>
                                                                <p className="font-bold truncate pr-3">{req.equipoId}</p>
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="p-3">
                                                            <p className="font-bold">{req.equipoId}</p>
                                                            <p className="text-xs">{eq?.direccion}</p>
                                                            <div className="flex gap-1 mt-1">
                                                                {req.urgencia === 'Urgente' && <Badge variant="destructive" className="text-[9px]">Urgente</Badge>}
                                                                {eq?.requiereCanasta && <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[9px]">Canasta</Badge>}
                                                                {eq?.zonaPeligrosa && <Badge variant="destructive" className="bg-purple-100 text-purple-700 text-[9px]">Zona Peligrosa</Badge>}
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip></TooltipProvider>
                                                );
                                            } else {
                                                return <div key={item.id} className="absolute bottom-4 h-14 bg-slate-200/50 border border-dashed border-slate-400 rounded flex items-center justify-center text-[10px] text-slate-500" style={getTimelineItemStyle(item, timeline[0])}>{item.type === 'planning' ? 'Planif.' : 'Almuerzo'}</div>;
                                            }
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 3 && (
          <Card><CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold mb-4">Finalizando Generación</h2>
            <Button onClick={async () => {
                setIsAiAssigning(true);
                try {
                  const ordersToCreate = routes.filter(r => r.requests.length > 0).map(r => ({
                      unidadesAsignadas: modifiableUnits.filter(u => r.assignedUnits.includes(u.id)).map(u => ({ rutaId: r.id, vehiculoId: u.vehiculoId, tecnicos: u.tecnicos })),
                      trabajos: r.requests.map(req => ({ equipoId: req.equipoId, solicitudId: req.id, tipoTrabajo: req.tipoTrabajo, estado: 'Pendiente' as any }))
                  }));
                  await createWorkOrdersBatch(ordersToCreate as any, currentUser!.uid);
                  toast({ title: "Órdenes Creadas" });
                  router.push("/work-orders");
                } catch (e) { toast({ title: "Error", description: (e as Error).message, variant: "destructive" }); }
                finally { setIsAiAssigning(false); }
            }} disabled={isAiAssigning}>{isAiAssigning ? "Procesando..." : "Crear Órdenes de Trabajo"}</Button>
          </CardContent></Card>
      )}

      <QuickRequestDialog open={isQuickRequestModalOpen} onClose={() => setIsQuickRequestModalOpen(false)} onSaveSuccess={(r: any) => { setPendingRequestsState(prev => [r, ...prev]); setIsPendingPanelCollapsed(false); }} allEquipos={allEquiposDetails} appSettings={appSettings} setRequestConflict={setRequestConflict}/>

      <AlertDialog open={!!requestConflict} onOpenChange={() => setRequestConflict(null)}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Conflicto de Solicitud</AlertDialogTitle><AlertDialogDescription>Ya existe una solicitud pendiente ({requestConflict?.existing?.displayId}) para este equipo. ¿Desea reemplazarla?</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => requestConflict?.onConfirm()}>Confirmar y Reemplazar</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
