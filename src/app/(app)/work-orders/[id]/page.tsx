

"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image"; 
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { OrdenDeTrabajo, Trabajo, UserProfile, Vehiculo, Equipo, Solicitud, AppSettingsState, GeoPoint } from "@/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getWorkOrderById, updateTrabajoInOrden } from "@/services/workOrderService";
import { getUsers } from "@/services/userService";
import { getVehiculos } from "@/services/vehicleService";
import { getEquipoById, getEquipos } from "@/services/equipmentService";
import { getSolicitudes } from "@/services/requestService";
import { getAppSettings } from "@/services/settingsService"; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; 
import { DashboardMap, type EquipmentLocationWithInfo } from "@/components/dashboard/DashboardMap";
import QRCode from 'qrcode';

interface MapRouteToDisplay {
  id: string;
  path: google.maps.LatLngLiteral[];
  color: string;
}

const getVehicleImagePath = (type?: Vehiculo["tipo"]): string => {
  switch (type) {
    case "camionetaCabinaSimple": return "/images/camionetaCabinaSimple.webp";
    case "camionetaCabinaDoble": return "/images/camionetaCabinaDoble.webp";
    case "camionCanasta": return "/images/camionCanasta.webp";
    default: return "/images/camionetaCabinaSimple.webp"; 
  }
};

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

export default function WorkOrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [order, setOrder] = useState<OrdenDeTrabajo | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [vehicles, setVehicles] = useState<Vehiculo[]>([]);
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);
  const [allSolicitudes, setAllSolicitudes] = useState<Solicitud[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null); 
  const [isLoading, setIsLoading] = useState(true);

  const [selectedJob, setSelectedJob] = useState<Trabajo | null>(null);
  const [selectedJobEquipo, setSelectedJobEquipo] = useState<Equipo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdatingJob, setIsUpdatingJob] = useState(false);

  const [isOrderRouteMapModalOpen, setIsOrderRouteMapModalOpen] = useState(false);
  const [orderEquipmentForMap, setOrderEquipmentForMap] = useState<EquipmentLocationWithInfo[]>([]);
  const [orderRoutePathForMap, setOrderRoutePathForMap] = useState<MapRouteToDisplay | null>(null);

  const [trabajoSolicitado, setTrabajoSolicitado] = useState("");
  const [hallazgos, setHallazgos] = useState("");
  const [jobStatus, setJobStatus] = useState<Trabajo["estado"]>("Pendiente");
  const [observacionSupervisor, setObservacionSupervisor] = useState("");
  const [motivoCancelacionModal, setMotivoCancelacionModal] = useState("");


  const fetchOrderDetails = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [fetchedOrder, fetchedUsers, fetchedVehicles, fetchedEquipos, fetchedSolicitudesData, fetchedAppSettings] = await Promise.all([
        getWorkOrderById(id),
        getUsers(),
        getVehiculos(),
        getEquipos(),
        getSolicitudes(),
        getAppSettings(), 
      ]);

      if (fetchedOrder) {
        setOrder(fetchedOrder);
      } else {
        toast({ title: "Error", description: `Orden de trabajo con ID ${id} no encontrada.`, variant: "destructive" });
      }
      setUsers(fetchedUsers);
      setVehicles(fetchedVehicles);
      setAllEquipos(fetchedEquipos);
      setAllSolicitudes(fetchedSolicitudesData);
      setAppSettings(fetchedAppSettings); 

    } catch (error) {
      console.error("Error fetching work order details:", error);
      toast({ title: "Error al Cargar Datos", description: "No se pudo obtener la información de la orden de trabajo.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);
  
  const isSupervisorOrAdmin = userProfile?.perfiles.some(p => ["supervisor", "administrador"].includes(p));

  const isJobReviewableBySupervisor = (job: Trabajo | null): boolean => {
      if (!job || !userProfile) return false;
      return (job.estado === "Completado" || job.estado === "No Completado" || job.estado === "Cancelado") &&
             userProfile.perfiles.some(p => ["supervisor", "ingenieroDeOficina", "administrador"].includes(p as string));
  };

  const canUserUpdateJobStatus = (job: Trabajo | null): boolean => {
    if (!job || !userProfile) return false;
    if (job.estado === "Pendiente" && userProfile.perfiles.includes("tecnicoDeCampo")) return true;
    if (isSupervisorOrAdmin) return true; 
    if (isJobReviewableBySupervisor(job) && userProfile.perfiles.includes("ingenieroDeOficina")) return false; 
    return false;
  };
  
  const canUserAddSupervisorObservation = (job: Trabajo | null): boolean => {
    if (!job || !userProfile) return false;
    return (job.estado === "Completado" || job.estado === "No Completado" || job.estado === "Cancelado") &&
           userProfile.perfiles.some(p => ["supervisor", "ingenieroDeOficina", "administrador"].includes(p));
  };


  const handleOpenJobModal = async (job: Trabajo) => {
    setSelectedJob(job);
    setTrabajoSolicitado(job.detalles || ""); 
    setHallazgos(job.hallazgos || ""); 
    setJobStatus(job.estado);
    setObservacionSupervisor(job.observacionIngeniero || "");
    setMotivoCancelacionModal(job.motivoCancelacion || "");

    try {
        const equipo = await getEquipoById(job.equipoId);
        setSelectedJobEquipo(equipo);
    } catch (error) {
        console.error("Error fetching equipo details for modal:", error);
        setSelectedJobEquipo(null);
        toast({ title: "Error", description: `No se pudieron cargar los detalles del equipo ${job.equipoId}.`, variant: "destructive"});
    }
    setIsModalOpen(true);
  };

  const handleUpdateJob = async () => {
    if (!selectedJob || !order || !currentUser) return;

    if (jobStatus === "Cancelado" && isSupervisorOrAdmin && motivoCancelacionModal.trim() === "") {
      toast({ title: "Error de Validación", description: "El motivo de cancelación es obligatorio.", variant: "destructive"});
      return;
    }

    setIsUpdatingJob(true);

    const updates: Partial<Omit<Trabajo, 'id' | 'solicitudId' | 'equipoId' | 'tipoTrabajo'>> = {
      estado: jobStatus,
    };

    if (canUserAddSupervisorObservation(selectedJob)) {
        updates.observacionIngeniero = observacionSupervisor.trim() === "" ? undefined : observacionSupervisor.trim();
    }
    
    if (selectedJob.estado === "Pendiente" && (jobStatus === "Completado" || jobStatus === "No Completado")) {
      updates.detalles = trabajoSolicitado.trim() === "" ? undefined : trabajoSolicitado.trim();
      updates.hallazgos = hallazgos.trim() === "" ? undefined : hallazgos.trim();
    }
    
    if (jobStatus === "Cancelado" && isSupervisorOrAdmin) {
        updates.motivoCancelacion = motivoCancelacionModal.trim();
    }


    try {
      await updateTrabajoInOrden(order.id, selectedJob.id, updates, currentUser.uid);
      toast({ title: "Trabajo Actualizado", description: `El trabajo ${selectedJob.id} ha sido actualizado.` });
      await fetchOrderDetails();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error updating job:", error);
      toast({ title: "Error al Actualizar", description: (error as Error).message || "No se pudo actualizar el trabajo.", variant: "destructive" });
    } finally {
      setIsUpdatingJob(false);
    }
  };

  const handleOpenOrderRouteMapModal = () => {
    if (!order || allEquipos.length === 0 || !appSettings) { 
      toast({ title: "Datos Insuficientes", description: "No se pueden mostrar la ruta sin detalles de la orden, equipos o configuración de sede.", variant: "destructive" });
      return;
    }
  
    const equipmentForRoute: EquipmentLocationWithInfo[] = [];
    const pathCoordinates: google.maps.LatLngLiteral[] = [];
    
    const sedeLat = appSettings.sedeCentralLatitud;
    const sedeLng = appSettings.sedeCentralLongitud;
    const hasValidSedeCoords = typeof sedeLat === 'number' && typeof sedeLng === 'number';
  
    if (hasValidSedeCoords) {
        const sedeLocationInfo: EquipmentLocationWithInfo = {
            id: "sede_central_marker_ot_detail",
            coordenadas: { latitude: sedeLat, longitude: sedeLng },
            tipo: "Sede Central" as any,
            marca: appSettings.empresaNombre || "Sede Principal",
        };
        equipmentForRoute.push(sedeLocationInfo);
        pathCoordinates.push({ lat: sedeLat, lng: sedeLng });
    }
  
  
    const sortedTrabajos = [...order.trabajos].sort((a, b) => a.id.localeCompare(b.id));
  
    sortedTrabajos.forEach(trabajo => {
      const equipo = allEquipos.find(eq => eq.id === trabajo.equipoId);
      if (equipo && equipo.coordenadas && typeof equipo.coordenadas.latitude === 'number' && typeof equipo.coordenadas.longitude === 'number') {
        equipmentForRoute.push({
          id: equipo.id,
          coordenadas: equipo.coordenadas,
          tipo: equipo.tipo,
          marca: equipo.marca,
        });
        pathCoordinates.push({ lat: equipo.coordenadas.latitude, lng: equipo.coordenadas.longitude });
      }
    });
    
    setOrderEquipmentForMap(equipmentForRoute);
    if (pathCoordinates.length > (hasValidSedeCoords ? 1 : 0)) {
      setOrderRoutePathForMap({
        id: `ot-route-${order.id}`,
        path: pathCoordinates,
        color: "#FF5733",
      });
    } else {
      setOrderRoutePathForMap(null);
    }
    setIsOrderRouteMapModalOpen(true);
  };


  const handleViewPrintableVersion = () => {
    if (!order) return;
    window.open(`/print/work-order/${order.id}`, '_blank');
  };

  const getStatusVariant = (status?: Trabajo["estado"] | OrdenDeTrabajo["estadoGeneral"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente": return "destructive";
      case "Completado":
      case "CompletadaTotal": return "default";
      case "No Completado":
      case "CompletadaParcial": return "secondary";
      case "En Progreso": return "default";
      case "Cancelada": return "secondary";
      default: return "outline";
    }
  };

  const getStatusColorClass = (status?: Trabajo["estado"] | OrdenDeTrabajo["estadoGeneral"]): string => {
    switch (status) {
      case "Pendiente": return "bg-yellow-400 text-yellow-900";
      case "En Progreso": return "bg-blue-500 text-white";
      case "Completado":
      case "CompletadaTotal": return "bg-green-500 text-white";
      case "No Completado":
      case "CompletadaParcial": return "bg-teal-500 text-white";
      case "Cancelada": return "bg-slate-500 text-white";
      default: return "border";
    }
  };

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.nombre || userId;
  
  const getTipoTrabajoNombreFromSettings = (trabajoId: string, equipoId: string): string => {
    if (!appSettings || !trabajoId || !equipoId) return trabajoId;
    const equipo = allEquipos.find(e => e.id === equipoId);
    if (equipo) {
      const tipoEquipoConfig = appSettings.tiposEquipos.find(te => te.value === equipo.tipo);
      const trabajoConfig = tipoEquipoConfig?.tiposDeTrabajoAsociados.find(tt => tt.id === trabajoId);
      if (trabajoConfig) return trabajoConfig.nombre;
    }
    // Fallback for generic IDs or if specific type not found
    for (const te of appSettings.tiposEquipos) {
        const trabajo = te.tiposDeTrabajoAsociados.find(tt => tt.id === trabajoId);
        if (trabajo) return trabajo.nombre;
    }
    return trabajoId; // Return ID if no name found
  };


  const uniqueRouteIds = order ? Array.from(new Set(order.unidadesAsignadas.map(ua => ua.rutaId))) : [];


  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Cargando Orden de Trabajo..." />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Orden de Trabajo no Encontrada" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">La orden de trabajo con ID '{id}' no se pudo encontrar o cargar.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const modalTitle = selectedJob ? 
    (canUserAddSupervisorObservation(selectedJob) && selectedJob.estado !== "Pendiente" ? `Revisar Trabajo: ${selectedJob.id}` : `Actualizar Trabajo: ${selectedJob.id}`) 
    : "Detalle del Trabajo";
  const modalDescription = selectedJob ? 
    (canUserAddSupervisorObservation(selectedJob) && selectedJob.estado !== "Pendiente" ? "Revise los detalles y añada sus observaciones/cambie estado." : "Registre los detalles de la intervención.") 
    : "";


  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Orden de Trabajo: ${order.displayId}`}>
        <Button onClick={handleViewPrintableVersion}>
          <Icons.fileText className="mr-2 h-4 w-4" />
          Ver Versión Imprimible
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            <div><Label>ID Orden:</Label><p>{order.displayId}</p></div>
            <div><Label>Fecha Creación:</Label><p>{format(new Date(order.fechaCreacion), "dd/MM/yyyy HH:mm")}</p></div>
            <div><Label>Creado Por:</Label><p>{getUserName(order.creadoPor)}</p></div>
            <div>
              <Label>Estado General:</Label>
              <div>
                <Badge variant={getStatusVariant(order.estadoGeneral)} className={`${getStatusColorClass(order.estadoGeneral)}`}>{order.estadoGeneral || "No definido"}</Badge>
              </div>
            </div>
            {uniqueRouteIds.length > 0 && (
              <div className="lg:col-span-2">
                <Label>Ruta(s):</Label>
                <div className="flex items-center gap-2 flex-wrap">
                   {uniqueRouteIds.map(rutaId => (
                     <Badge key={rutaId} variant="outline">{rutaId.replace('route','Ruta ').replace(/\d+$/, m => parseInt(m).toString())}</Badge>
                   ))}
                  <Button variant="outline" size="sm" onClick={handleOpenOrderRouteMapModal} className="ml-2">
                    <Icons.mapPin className="mr-2 h-3 w-3" /> Ver Ruta en Mapa
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unidades Asignadas</CardTitle>
          </CardHeader>
          <CardContent>
            {order.unidadesAsignadas.map((unidad, index) => {
              const vehicle = vehicles.find(v => v.id === unidad.vehiculoId);
              const vehicleImagePath = getVehicleImagePath(vehicle?.tipo);
              return (
                <div key={index} className="mb-4 p-3 border rounded-md bg-muted/20">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold">Unidad: {unidad.vehiculoId} (Placa: {vehicle?.placa || 'N/A'})</h4>
                  </div>
                  <div className="flex items-start gap-4">
                    {vehicle && (
                      <Image 
                        src={vehicleImagePath} 
                        alt={vehicle.tipo || "Vehículo"} 
                        width={80} 
                        height={50} 
                        className="rounded-md object-cover"
                        unoptimized 
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium mb-1">Técnicos:</p>
                      <ul className="space-y-1">
                        {unidad.tecnicos.map(techId => {
                          const tecnico = users.find(u => u.id === techId);
                          return (
                            <li key={techId} className="flex items-center gap-2 text-sm">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={tecnico?.fotoUrl} alt={tecnico?.nombre || techId} data-ai-hint="avatar"/>
                                <AvatarFallback>{getInitials(tecnico?.nombre)}</AvatarFallback>
                              </Avatar>
                              {tecnico?.nombre || techId}
                            </li>
                          );
                        })}
                        {unidad.tecnicos.length === 0 && <li className="text-xs text-muted-foreground italic">Sin técnicos asignados.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
            {order.unidadesAsignadas.length === 0 && <p className="text-sm text-muted-foreground">No hay unidades asignadas a esta orden.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trabajos Incluidos ({order.trabajos?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Trabajo</TableHead>
                  <TableHead>Equipo ID</TableHead>
                  <TableHead>Tipo Trabajo</TableHead>
                  <TableHead>Tiempo Est. (min)</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Solicitado por</TableHead>
                  <TableHead>Fecha Fin.</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.trabajos?.map((trabajo) => {
                  const solicitudOriginal = allSolicitudes.find(s => s.id === trabajo.solicitudId);
                  const creadorSolicitud = solicitudOriginal ? getUserName(solicitudOriginal.creadoPor) : "N/A";
                  const tipoTrabajoNombre = getTipoTrabajoNombreFromSettings(trabajo.tipoTrabajo, trabajo.equipoId);
                  return (
                    <TableRow key={trabajo.id}>
                      <TableCell className="text-xs">{trabajo.id}</TableCell>
                      <TableCell>{trabajo.equipoId}</TableCell>
                      <TableCell>{tipoTrabajoNombre}</TableCell>
                      <TableCell className="text-center">{trabajo.tiempoServicioEstimado ?? "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(trabajo.estado)} className={`${getStatusColorClass(trabajo.estado)}`}>
                          {trabajo.estado}
                        </Badge>
                      </TableCell>
                      <TableCell>{creadorSolicitud}</TableCell>
                      <TableCell>{trabajo.fechaFinalizacion ? format(new Date(trabajo.fechaFinalizacion), "dd/MM/yy HH:mm") : "N/A"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleOpenJobModal(trabajo)}>
                          {(isJobReviewableBySupervisor(trabajo) && trabajo.estado !== "Pendiente") ? <Icons.edit className="mr-2 h-4 w-4" /> : (trabajo.estado === "Pendiente" ? <Icons.edit className="mr-2 h-4 w-4" /> : <Icons.view className="mr-2 h-4 w-4" />)}
                          {(isJobReviewableBySupervisor(trabajo) && trabajo.estado !== "Pendiente") ? "Revisar" : (trabajo.estado === "Pendiente" ? "Actualizar" : "Ver")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!order.trabajos || order.trabajos.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24">No hay trabajos en esta orden.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription>{modalDescription}</DialogDescription>
          </DialogHeader>
          {selectedJob && (
            <ScrollArea className="max-h-[70vh]">
            <div className="grid gap-4 py-4 pr-2">
              <div>
                <h4 className="font-semibold text-sm">Equipo: {selectedJob.equipoId} ({selectedJobEquipo?.tipo || 'N/A'})</h4>
                <p className="text-xs text-muted-foreground">
                    {selectedJobEquipo?.direccion || 'Dirección no disponible'} <br/>
                    Marca: {selectedJobEquipo?.marca || 'N/A'} - Zona: {selectedJobEquipo?.zona || 'N/A'}
                </p>
                 <div className="mt-1 text-xs">
                  {selectedJobEquipo?.requiereCanasta && <Badge variant="destructive" className="mr-1">Requiere Canasta</Badge>}
                  {selectedJobEquipo?.zonaPeligrosa && <Badge variant="destructive" className="bg-orange-500">Zona Peligrosa</Badge>}
                </div>
              </div>

              <div>
                <Label htmlFor="trabajoSolicitado">Trabajo Solicitado (Tipo: {getTipoTrabajoNombreFromSettings(selectedJob.tipoTrabajo, selectedJob.equipoId)})</Label>
                <Textarea
                  id="trabajoSolicitado"
                  value={trabajoSolicitado}
                  onChange={(e) => setTrabajoSolicitado(e.target.value)}
                  rows={3}
                  disabled={isUpdatingJob || selectedJob.estado !== "Pendiente"}
                  readOnly={selectedJob.estado !== "Pendiente"}
                />
                {selectedJob && selectedJob.solicitudId && (() => {
                  const solicitud = allSolicitudes.find(s => s.id === selectedJob.solicitudId);
                  if (solicitud) {
                    return (
                      <p className="text-xs text-muted-foreground mt-1">
                        Solicitado por: {getUserName(solicitud.creadoPor)}
                        {solicitud.fechaSolicitud ? ` el ${format(new Date(solicitud.fechaSolicitud), "dd/MM/yyyy HH:mm", { locale: es })}` : ''}
                        {selectedJob.tiempoServicioEstimado !== undefined && ` (Est: ${selectedJob.tiempoServicioEstimado} min)`}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <Label htmlFor="accionesRealizadas">Acciones realizadas/Hallazgos</Label>
                <Textarea
                  id="accionesRealizadas"
                  value={hallazgos}
                  onChange={(e) => setHallazgos(e.target.value)}
                  rows={3}
                  disabled={isUpdatingJob || selectedJob.estado !== "Pendiente"}
                  readOnly={selectedJob.estado !== "Pendiente"}
                />
                 {selectedJob.completadoPor && (selectedJob.estado === "Completado" || selectedJob.estado === "No Completado" || selectedJob.estado === "Cancelado") && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Actualizado por: {getUserName(selectedJob.completadoPor)}
                    {selectedJob.fechaFinalizacion ? ` - ${format(new Date(selectedJob.fechaFinalizacion), 'dd/MM/yyyy HH:mm')}` : ''}
                  </p>
                 )}
              </div>
              
              {selectedJob.fotos && selectedJob.fotos.length > 0 && (
                <div>
                  <Label>Fotos Adjuntas</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {selectedJob.fotos.map((fotoUrl, index) => (
                      <a key={index} href={fotoUrl} target="_blank" rel="noopener noreferrer" className="relative aspect-square block">
                        <Image
                          src={fotoUrl}
                          alt={`Foto del trabajo ${index + 1}`}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="rounded-md object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {canUserAddSupervisorObservation(selectedJob) && (
                <div>
                  <Label htmlFor="observacionesComentarios">Observaciones/Comentarios (Supervisor/Ingeniero)</Label>
                  <Textarea
                    id="observacionesComentarios"
                    value={observacionSupervisor}
                    onChange={(e) => setObservacionSupervisor(e.target.value)}
                    rows={3}
                    disabled={isUpdatingJob}
                  />
                  {selectedJob.observacionIngeniero && selectedJob.observacionIngenieroPor && selectedJob.fechaObservacionIngeniero && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Revisado por: {getUserName(selectedJob.observacionIngenieroPor)} el {format(new Date(selectedJob.fechaObservacionIngeniero), "dd/MM/yyyy HH:mm", { locale: es })}
                    </p>
                  )}
                </div>
              )}
              
              {jobStatus === "Cancelado" && isSupervisorOrAdmin && (
                <div className="mt-2">
                  <Label htmlFor="motivoCancelacionModal">Motivo de Cancelación (Requerido)</Label>
                  <Textarea
                    id="motivoCancelacionModal"
                    value={motivoCancelacionModal}
                    onChange={(e) => setMotivoCancelacionModal(e.target.value)}
                    rows={2}
                    disabled={isUpdatingJob}
                    placeholder="Especifique el motivo de la cancelación..."
                  />
                </div>
              )}
              {selectedJob.estado === "Cancelado" && !isSupervisorOrAdmin && selectedJob.motivoCancelacion && (
                <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md">
                  <p className="text-xs font-semibold text-destructive">Trabajo Cancelado. Motivo:</p>
                  <p className="text-xs text-destructive/90">{selectedJob.motivoCancelacion}</p>
                </div>
              )}


              <div>
                <Label htmlFor="status">Estado del Trabajo</Label>
                <Select
                  value={jobStatus}
                  onValueChange={(value) => setJobStatus(value as Trabajo["estado"])}
                  disabled={isUpdatingJob || !canUserUpdateJobStatus(selectedJob)}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Completado">Completado</SelectItem>
                    <SelectItem value="No Completado">No Completado</SelectItem>
                    {isSupervisorOrAdmin && <SelectItem value="Cancelado">Cancelado</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isUpdatingJob}>Cancelar</Button>
            <Button onClick={handleUpdateJob} disabled={isUpdatingJob || (!canUserUpdateJobStatus(selectedJob) && !canUserAddSupervisorObservation(selectedJob))}>
                {isUpdatingJob ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.save className="mr-2 h-4 w-4" />}
                Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOrderRouteMapModalOpen} onOpenChange={setIsOrderRouteMapModalOpen}>
        <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Mapa de Ruta para OT: {order.displayId}</DialogTitle>
            <DialogDescription>Visualización de los equipos y la ruta estimada para esta orden de trabajo.</DialogDescription>
          </DialogHeader>
          <div className="flex-grow p-0 border-t">
            {orderEquipmentForMap.length > 0 || (orderRoutePathForMap && orderRoutePathForMap.path.length > 0) ? (
              <DashboardMap
                key={`map-${order.id}`} 
                equipmentLocations={orderEquipmentForMap}
                routesToDisplay={orderRoutePathForMap ? [orderRoutePathForMap] : []}
                allUsers={users}
                appSettings={appSettings}
                allEquipos={allEquipos}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No hay suficientes datos de equipos con coordenadas para mostrar la ruta.</p>
              </div>
            )}
          </div>
          <DialogFooter className="p-4 border-t">
            <Button variant="outline" onClick={() => setIsOrderRouteMapModalOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
