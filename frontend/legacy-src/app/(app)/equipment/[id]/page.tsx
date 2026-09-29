

"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image"; 
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icons } from "@/components/icons";
import type { Equipo, Trabajo, OrdenDeTrabajo, UserProfile, Solicitud, EstadoHistorialEntry } from "@/types";
import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getEquipoById } from "@/services/equipmentService";
import { getWorkOrders } from "@/services/workOrderService";
import { getUsers } from "@/services/userService";
import { getSolicitudes } from "@/services/requestService"; 
import { Timestamp } from "firebase/firestore";
import { DashboardMap } from "@/components/dashboard/DashboardMap"; 
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface JobHistoryEntry extends Trabajo {
  unidadesParticipantesIds?: string[];
  ordenDeTrabajoId: string; 
}

const getBrandLogoPath = (marca?: string): string | null => {
  if (!marca) return null;
  const lowerMarca = marca.toLowerCase();
  if (lowerMarca.includes("itron")) return "/images/itronLogo.webp";
  if (lowerMarca.includes("honeywell")) return "/images/honeywellLogo.webp";
  if (lowerMarca.includes("trilliant")) return "/images/trilliantLogo.webp";
  return null;
};

export default function EquipmentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const [equipment, setEquipment] = useState<Equipo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allWorkOrdersData, setAllWorkOrdersData] = useState<OrdenDeTrabajo[]>([]);
  const [allSolicitudesData, setAllSolicitudesData] = useState<Solicitud[]>([]); 
  
  const [selectedJob, setSelectedJob] = useState<JobHistoryEntry | null>(null);
  const [isJobDetailModalOpen, setIsJobDetailModalOpen] = useState(false);
  
  useEffect(() => {
    if (id) {
      const fetchPrimaryData = async () => {
        setIsLoading(true);
        try {
          const [fetchedEquipo, fetchedWorkOrders, fetchedUsersData, fetchedSolicitudes] = await Promise.all([
            getEquipoById(id),
            getWorkOrders(),
            getUsers(),
            getSolicitudes(), 
          ]);
          setEquipment(fetchedEquipo);
          setAllWorkOrdersData(fetchedWorkOrders);
          setAllUsers(fetchedUsersData);
          setAllSolicitudesData(fetchedSolicitudes); 
        } catch (error) {
          console.error("Error fetching primary data for equipment detail:", error);
          toast({
            title: "Error al Cargar Datos",
            description: "No se pudieron obtener los detalles del equipo o el historial de trabajos.",
            variant: "destructive",
          });
          setEquipment(null); 
          setAllWorkOrdersData([]);
          setAllUsers([]);
          setAllSolicitudesData([]); 
        } finally {
          setIsLoading(false);
        }
      };
      fetchPrimaryData();
    }
  }, [id, toast]);

  const jobHistory = useMemo((): JobHistoryEntry[] => {
    if (!equipment || allWorkOrdersData.length === 0) {
      return [];
    }

    const relevantJobs: JobHistoryEntry[] = [];
    allWorkOrdersData.forEach((order: OrdenDeTrabajo) => {
      order.trabajos.forEach((job: Trabajo) => {
        if (job.equipoId === equipment.id) {
          const unidadesIds = order.unidadesAsignadas.map(ua => ua.vehiculoId);

          relevantJobs.push({
            ...job,
            fechaFinalizacion: job.fechaFinalizacion ? (job.fechaFinalizacion instanceof Timestamp ? job.fechaFinalizacion.toDate() : (typeof job.fechaFinalizacion === 'string' ? parseISO(job.fechaFinalizacion) : job.fechaFinalizacion)) : undefined,
            fechaNuevaRevision: job.fechaNuevaRevision ? (job.fechaNuevaRevision instanceof Timestamp ? job.fechaNuevaRevision.toDate() : (typeof job.fechaNuevaRevision === 'string' ? parseISO(job.fechaNuevaRevision) : job.fechaNuevaRevision)) : undefined,
            fechaObservacionIngeniero: job.fechaObservacionIngeniero ? (job.fechaObservacionIngeniero instanceof Timestamp ? job.fechaObservacionIngeniero.toDate() : (typeof job.fechaObservacionIngeniero === 'string' ? parseISO(job.fechaObservacionIngeniero) : job.fechaObservacionIngeniero)) : undefined,
            unidadesParticipantesIds: unidadesIds.length > 0 ? Array.from(new Set(unidadesIds)) : undefined,
            ordenDeTrabajoId: order.id, 
          });
        }
      });
    });
    return relevantJobs.sort((a, b) => (b.fechaFinalizacion?.getTime() || new Date(b.solicitudId ? allSolicitudesData.find(s=>s.id === b.solicitudId)?.fechaSolicitud || 0 : 0).getTime()) - (a.fechaFinalizacion?.getTime() || new Date(a.solicitudId ? allSolicitudesData.find(s=>s.id === a.solicitudId)?.fechaSolicitud || 0 : 0).getTime()));
  }, [equipment, allWorkOrdersData, allSolicitudesData]);

  const displayedLastRevisionDate = useMemo(() => {
    const latestCompletedJob = jobHistory.find(
        job => job.estado === "Completado" && job.fechaFinalizacion
    );
    return latestCompletedJob?.fechaFinalizacion || null; 
  }, [jobHistory]);

  const getUserProfileById = (userId?: string): UserProfile | null => {
    if (!userId || !allUsers) return null;
    return allUsers.find(u => u.id === userId) || null;
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

  const handleViewJobDetails = (job: JobHistoryEntry) => {
    setSelectedJob(job);
    setIsJobDetailModalOpen(true);
  };
  
  const getStatusVariantJob = (status: Trabajo["estado"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente": return "destructive"; 
      case "Completado": return "default"; 
      case "No Completado": return "secondary";
      case "Cancelado": return "secondary";
      default: return "outline";
    }
  };
  
  const getStatusColorClassJob = (status: Trabajo["estado"]): string => {
    switch (status) {
      case "Pendiente": return "bg-yellow-400 text-yellow-900 hover:bg-yellow-500";
      case "Completado": return "bg-green-500 text-white hover:bg-green-600";
      case "No Completado": return "bg-orange-500 text-white hover:bg-orange-600";
      case "Cancelado": return "bg-gray-500 text-white hover:bg-gray-600";
      default: return "border";
    }
  };

  const getStatusVariantUrgencia = (status?: Solicitud["urgencia"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Urgente": return "destructive";
      case "Normal": return "default";
      default: return "outline";
    }
  };
  
  const getStatusColorClassUrgencia = (status?: Solicitud["urgencia"]): string => {
     switch (status) {
      case "Urgente": return "bg-red-500 text-white hover:bg-red-600";
      case "Normal": return "bg-blue-500 text-white hover:bg-blue-600";
      default: return "";
    }
  }


  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Detalle de Equipo" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Detalle de Equipo" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Equipo con ID '{id}' no encontrado.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const equipmentForMap = equipment ? [{ id: equipment.id, coordenadas: equipment.coordenadas, tipo: equipment.tipo, marca: equipment.marca }] : [];
  const brandLogoPath = getBrandLogoPath(equipment?.marca);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Equipo: ${equipment.id}`} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Información del Equipo</CardTitle>
          {brandLogoPath && (
            <div className="relative h-8 w-24"> 
              <Image
                src={brandLogoPath}
                alt={`${equipment.marca} Logo`}
                width={72} 
                height={24} 
                objectFit="contain"
                unoptimized 
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <div><Label>Identificación:</Label><p className="text-sm">{equipment.id}</p></div>
          <div><Label>Tipo:</Label><p className="text-sm">{equipment.tipo}</p></div>
          <div><Label>Dirección:</Label><p className="text-sm">{equipment.direccion}</p></div>
          <div><Label>Marca:</Label><p className="text-sm">{equipment.marca}</p></div>
          <div><Label>Zona:</Label><p className="text-sm">{equipment.zona}</p></div>
          <div><Label>IP:</Label><p className="text-sm">{equipment.ip || "N/A"}</p></div>
          <div><Label>Tipo Comunicación:</Label><p className="text-sm">{equipment.tipoComunicacion}</p></div>
          <div><Label>Piloto:</Label><p className="text-sm">{equipment.piloto || "N/A"}</p></div>
          <div><Label>Coordenadas:</Label><p className="text-sm">{`Lat: ${equipment.coordenadas.latitude.toFixed(4)}, Lon: ${equipment.coordenadas.longitude.toFixed(4)}`}</p></div>
          <div>
            <Label>Última Revisión:</Label>
            <p className="text-sm">
              {displayedLastRevisionDate ? format(displayedLastRevisionDate, "dd/MM/yyyy HH:mm") : "N/A"}
            </p>
          </div>
          <div><Label>Total Revisiones (DB):</Label><p className="text-sm">{equipment.revisionCount}</p></div>
          <div>
            <Label>Requiere Canasta:</Label>
            <div className="text-sm mt-1">{equipment.requiereCanasta ? 
                <Badge variant="destructive">Sí</Badge> : 
                <Badge variant="secondary">No</Badge>}
            </div>
          </div>
          <div>
            <Label>Zona Peligrosa:</Label>
            <div className="text-sm mt-1">{equipment.zonaPeligrosa ? 
                <Badge variant="destructive" className="bg-orange-500 text-white">Sí</Badge> : 
                <Badge variant="secondary">No</Badge>}
            </div>
          </div>
           <div>
            <Label>Próx. Mant. Programado:</Label>
            <p className="text-sm">
                {equipment.proximoMantenimientoProgramado ? format(new Date(equipment.proximoMantenimientoProgramado), "dd/MM/yyyy") : "No programado"}
            </p>
          </div>
          <div>
            <Label>Intervalo Mant. (Días):</Label>
            <p className="text-sm">{equipment.intervaloMantenimientoDias ?? "N/A"}</p>
          </div>
          <div>
            <Label>Intervalo Mant. (Revisiones):</Label>
            <p className="text-sm">{equipment.intervaloMantenimientoRevisiones ?? "N/A"}</p>
          </div>
        </CardContent>
        <CardContent className="mt-4 p-0 h-[300px]"> 
            <DashboardMap equipmentLocations={equipmentForMap} simpleInfoWindow={true} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Estados</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Modificado Por</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipment.estadoHistorial && equipment.estadoHistorial.length > 0 ? (
                  equipment.estadoHistorial.sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>
                         <Badge variant={entry.estado.toLowerCase() === "activo" ? "default" : "destructive"} className={entry.estado.toLowerCase() === "activo" ? "bg-green-500" : "bg-red-500"}>
                           {entry.estado}
                         </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(entry.fecha), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>{entry.modificadoPor}</TableCell>
                      <TableCell>{entry.motivo || "N/A"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">No hay historial de estados para este equipo.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <h3 className="text-xl font-semibold mt-8 mb-4">Historial de revisiones</h3>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Trabajos ({jobHistory.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Trabajo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo Trabajo</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobHistory.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-xs" title={job.id}>{job.id}</TableCell>
                  <TableCell>{job.fechaFinalizacion ? format(job.fechaFinalizacion, "dd/MM/yyyy") : "N/A"}</TableCell>
                  <TableCell>{job.tipoTrabajo}</TableCell>
                  <TableCell>
                    {job.unidadesParticipantesIds && job.unidadesParticipantesIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {job.unidadesParticipantesIds.map(unitId => (
                          <Badge key={unitId} variant="secondary" className="text-xs">
                            {unitId}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariantJob(job.estado)} className={getStatusColorClassJob(job.estado)}>{job.estado}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => handleViewJobDetails(job)}>
                      <Icons.view className="mr-2 h-3 w-3" /> Ver Detalles
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {jobHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">No hay historial de trabajos para este equipo.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isJobDetailModalOpen} onOpenChange={setIsJobDetailModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          {selectedJob && (() => {
            const parentOrder = allWorkOrdersData.find(order => order.id === selectedJob.ordenDeTrabajoId);
            const solicitudOriginal = selectedJob.solicitudId ? allSolicitudesData.find(s => s.id === selectedJob.solicitudId) : null;
            
            const solicitanteProfile = solicitudOriginal?.creadoPor ? getUserProfileById(solicitudOriginal.creadoPor) : null;
            const asignadorProfile = parentOrder?.creadoPor ? getUserProfileById(parentOrder.creadoPor) : null;
            const registradorProfile = selectedJob?.completadoPor ? getUserProfileById(selectedJob.completadoPor) : null;
            const comentadorProfile = selectedJob?.observacionIngenieroPor ? getUserProfileById(selectedJob.observacionIngenieroPor) : null;

            return (
              <>
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl font-semibold">{selectedJob.id}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4 text-sm">
                  <p><strong>Equipo:</strong> {selectedJob.equipoId}</p>
                  <p><strong>Tipo de Trabajo:</strong> {selectedJob.tipoTrabajo}</p>
                  <div>
                    <strong>Estado:</strong> <Badge variant={getStatusVariantJob(selectedJob.estado)} className={`${getStatusColorClassJob(selectedJob.estado)} ml-1`}>{selectedJob.estado}</Badge>
                  </div>
                  {solicitudOriginal && (
                    <div>
                      <strong>Urgencia:</strong> <Badge variant={getStatusVariantUrgencia(solicitudOriginal.urgencia)} className={`${getStatusColorClassUrgencia(solicitudOriginal.urgencia)} ml-1`}>{solicitudOriginal.urgencia}</Badge>
                    </div>
                  )}
                </div>

                <ScrollArea className="max-h-[60vh] pr-2">
                  <div className="space-y-4">
                    {solicitudOriginal && (
                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={solicitanteProfile?.fotoUrl || undefined} alt={solicitanteProfile?.nombre || "S"} />
                            <AvatarFallback>{getInitials(solicitanteProfile?.nombre)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-semibold">{solicitanteProfile?.nombre || "Desconocido"}</span>
                          <span className="text-sm text-muted-foreground">solicitó:</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {solicitudOriginal.fechaSolicitud ? format(new Date(solicitudOriginal.fechaSolicitud), "dd/MM/yyyy HH:mm") : "N/A"}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1">{solicitudOriginal.displayId || solicitudOriginal.id}</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{solicitudOriginal.descripcion || "Sin descripción de solicitud."}</p>
                      </div>
                    )}

                    {parentOrder && (
                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Avatar className="h-8 w-8">
                             <AvatarImage src={asignadorProfile?.fotoUrl || undefined} alt={asignadorProfile?.nombre || "A"} />
                             <AvatarFallback>{getInitials(asignadorProfile?.nombre)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-semibold">{asignadorProfile?.nombre || "Desconocido"}</span>
                          <span className="text-sm text-muted-foreground">asignó:</span>
                           <span className="text-xs text-muted-foreground ml-auto">
                            {parentOrder.fechaCreacion ? format(new Date(parentOrder.fechaCreacion), "dd/MM/yyyy HH:mm") : "N/A"}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1">{parentOrder.displayId}</p>
                        <div className="text-sm text-gray-700">
                          <p className="font-medium">Unidades Asignadas:</p>
                          {parentOrder.unidadesAsignadas.map(ua => (
                            <div key={ua.vehiculoId + ua.rutaId} className="flex items-center gap-1.5 ml-2 my-0.5">
                              <Badge variant="secondary" className="text-xs">{ua.vehiculoId}</Badge>
                              <span className="text-xs">
                                (Técnicos: {ua.tecnicos.map(tid => getUserProfileById(tid)?.nombre || tid).join(', ') || "N/A"})
                              </span>
                            </div>
                          ))}
                          {parentOrder.unidadesAsignadas.length === 0 && <p className="text-xs italic">Ninguna unidad asignada directamente a esta OT.</p>}
                        </div>
                      </div>
                    )}

                    {(selectedJob.completadoPor || selectedJob.hallazgos) && (
                        <div className="bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={registradorProfile?.fotoUrl || undefined} alt={registradorProfile?.nombre || "R"} />
                                    <AvatarFallback>{getInitials(registradorProfile?.nombre)}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-semibold">{registradorProfile?.nombre || "Desconocido"}</span>
                                <span className="text-sm text-muted-foreground">registró:</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                    {selectedJob.fechaFinalizacion ? format(new Date(selectedJob.fechaFinalizacion), "dd/MM/yyyy HH:mm") : "N/A"}
                                </span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedJob.hallazgos || selectedJob.detalles || "No se registraron hallazgos o detalles específicos."}</p>
                            {selectedJob.estado === "Cancelado" && selectedJob.motivoCancelacion && (
                                <div className="mt-2 p-2 text-xs bg-destructive/10 border border-destructive/30 rounded-md text-destructive">
                                    <strong>Motivo Cancelación:</strong> {selectedJob.motivoCancelacion}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {selectedJob.observacionIngeniero && (
                        <div className="bg-slate-50 rounded-lg p-3">
                             <div className="flex items-center gap-2 mb-1.5">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={comentadorProfile?.fotoUrl || undefined} alt={comentadorProfile?.nombre || "C"} />
                                    <AvatarFallback>{getInitials(comentadorProfile?.nombre)}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-semibold">{comentadorProfile?.nombre || "Desconocido"}</span>
                                <span className="text-sm text-muted-foreground">comentó:</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                    {selectedJob.fechaObservacionIngeniero ? format(new Date(selectedJob.fechaObservacionIngeniero), "dd/MM/yyyy HH:mm") : "N/A"}
                                </span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedJob.observacionIngeniero}</p>
                        </div>
                    )}
                    {selectedJob.requiereNuevaRevision && (
                        <p className="text-sm font-semibold text-destructive mt-3">Requiere nueva revisión el: {selectedJob.fechaNuevaRevision ? format(selectedJob.fechaNuevaRevision, "dd/MM/yyyy") : 'Fecha no especificada'}</p>
                    )}
                  </div>
                </ScrollArea>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
    

