
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icons } from "@/components/icons";
import type { Trabajo, Equipo, OrdenDeTrabajo, UserProfile, Solicitud, AppSettingsState } from "@/types";
import { format } from 'date-fns';
import { es } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getWorkOrders, updateTrabajoInOrden } from "@/services/workOrderService";
import { getEquipos, getEquipoById } from "@/services/equipmentService"; 
import { getSolicitudById } from "@/services/requestService"; 
import { getUsers } from "@/services/userService";
import { getAppSettings } from "@/services/settingsService"; // Importar
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardMap, type EquipmentLocationWithInfo } from "@/components/dashboard/DashboardMap"; 
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/firebase";
import imageCompression from 'browser-image-compression';
import { Progress } from "@/components/ui/progress";

interface EnrichedTrabajo extends Trabajo {
  ordenId: string;
  ordenDisplayId: string;
  equipoInfo?: Pick<Equipo, "id" | "direccion" | "tipo" | "marca" | "zona" | "requiereCanasta" | "zonaPeligrosa" | "coordenadas">;
}

export default function TechnicianMyJobsPage() {
  const { currentUser } = useAuth(); 
  const { toast } = useToast();

  const [assignedJobs, setAssignedJobs] = useState<EnrichedTrabajo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null); // Estado para settings
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]); // Para buscar tipo de equipo
  
  const [selectedJob, setSelectedJob] = useState<EnrichedTrabajo | null>(null);
  const [selectedJobEquipo, setSelectedJobEquipo] = useState<Equipo | null>(null);
  const [selectedSolicitudInfo, setSelectedSolicitudInfo] = useState<Solicitud | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdatingJob, setIsUpdatingJob] = useState(false);

  const [trabajoSolicitado, setTrabajoSolicitado] = useState(""); 
  const [modalHallazgos, setModalHallazgos] = useState("");
  const [modalJobStatus, setModalJobStatus] = useState<Trabajo["estado"]>("Pendiente");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);

  const fetchTechnicianJobs = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [allOrders, allEquiposData, fetchedUsers, fetchedAppSettings] = await Promise.all([
        getWorkOrders(),
        getEquipos(), 
        getUsers(),
        getAppSettings(), // Obtener settings
      ]);

      setAllUsers(fetchedUsers);
      setAppSettings(fetchedAppSettings);
      setAllEquipos(allEquiposData); // Guardar todos los equipos

      const technicianSpecificJobs: EnrichedTrabajo[] = [];
      allOrders.forEach(order => {
        const isTechnicianAssignedToOrder = order.unidadesAsignadas.some(unidad => 
          unidad.tecnicos.includes(currentUser.uid)
        );

        if (isTechnicianAssignedToOrder) {
          order.trabajos.forEach(trabajo => {
            if (trabajo.estado === "Pendiente" || (trabajo.estado !== "Pendiente" && trabajo.completadoPor === currentUser.uid)) {
              const equipoData = allEquiposData.find(eq => eq.id === trabajo.equipoId);
              technicianSpecificJobs.push({
                ...trabajo,
                ordenId: order.id,
                ordenDisplayId: order.displayId,
                equipoInfo: equipoData ? {
                  id: equipoData.id,
                  direccion: equipoData.direccion,
                  tipo: equipoData.tipo,
                  marca: equipoData.marca,
                  zona: equipoData.zona,
                  requiereCanasta: equipoData.requiereCanasta,
                  zonaPeligrosa: equipoData.zonaPeligrosa,
                  coordenadas: equipoData.coordenadas,
                } : undefined,
              });
            }
          });
        }
      });
      
      technicianSpecificJobs.sort((a, b) => {
        if (a.estado === "Pendiente" && b.estado !== "Pendiente") return -1;
        if (a.estado !== "Pendiente" && b.estado === "Pendiente") return 1;
        return a.ordenDisplayId.localeCompare(b.ordenDisplayId) || a.id.localeCompare(b.id);
      });

      setAssignedJobs(technicianSpecificJobs);

    } catch (error) {
      console.error("Error fetching technician jobs:", error);
      toast({
        title: "Error al Cargar Trabajos",
        description: "No se pudieron obtener tus trabajos asignados.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, toast]);

  useEffect(() => {
    fetchTechnicianJobs();
  }, [fetchTechnicianJobs]);

  const getUserNameById = (userId?: string): string => {
    if (!userId || !allUsers) return userId || "Desconocido";
    const user = allUsers.find(u => u.id === userId);
    return user ? user.nombre : userId;
  };

  const getTipoTrabajoNombreFromSettings = (trabajoId: string, equipoId: string): string => {
    if (!appSettings || !trabajoId || !equipoId) return trabajoId;
    const equipo = allEquipos.find(e => e.id === equipoId);
    if (equipo) {
      const tipoEquipoConfig = appSettings.tiposEquipos.find(te => te.value === equipo.tipo);
      const trabajoConfig = tipoEquipoConfig?.tiposDeTrabajoAsociados.find(tt => tt.id === trabajoId);
      if (trabajoConfig) return trabajoConfig.nombre;
    }
    for (const te of appSettings.tiposEquipos) {
        const trabajo = te.tiposDeTrabajoAsociados.find(tt => tt.id === trabajoId);
        if (trabajo) return trabajo.nombre;
    }
    return trabajoId; 
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        const filesArray = Array.from(event.target.files);
        if ((selectedJob?.fotos?.length || 0) + selectedFiles.length + filesArray.length > 5) {
             toast({ title: "Límite de archivos", description: "Puedes subir un máximo de 5 fotos por trabajo.", variant: "destructive" });
             return;
        }
        setSelectedFiles(prev => [...prev, ...filesArray]);

        const newPreviews = filesArray.map(file => URL.createObjectURL(file));
        setImagePreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const handleOpenJobModal = async (job: EnrichedTrabajo) => {
    setSelectedJob(job);
    setTrabajoSolicitado(job.detalles || "No especificado en la OT."); 
    setModalHallazgos(job.hallazgos || "");
    setModalJobStatus(job.estado);
    setSelectedSolicitudInfo(null); 
    setSelectedJobEquipo(null);
    setSelectedFiles([]);
    setImagePreviews([]);
    setUploadProgress([]);
    setIsUploading(false);

    if (job.solicitudId) {
        try {
            const solicitud = await getSolicitudById(job.solicitudId);
            setSelectedSolicitudInfo(solicitud);
        } catch (solError) {
            console.error("Error fetching solicitud details:", solError);
            toast({ title: "Error", description: "No se pudo cargar la información de la solicitud original.", variant: "destructive" });
        }
    }

    if (job.equipoId) {
      try {
          const equipo = await getEquipoById(job.equipoId);
          setSelectedJobEquipo(equipo);
      } catch (error) {
          console.error("Error fetching equipo details for modal:", error);
          toast({ title: "Error", description: `No se pudieron cargar los detalles del equipo ${job.equipoId}.`, variant: "destructive"});
      }
    }
    setIsModalOpen(true);
  };

  const handleUpdateJob = async () => {
    if (!selectedJob || !currentUser) return;
    setIsUpdatingJob(true);

    let uploadedImageUrls: string[] = selectedJob.fotos || [];

    if (selectedFiles.length > 0) {
        setIsUploading(true);
        setUploadProgress(new Array(selectedFiles.length).fill(0));

        const uploadPromises = selectedFiles.map(async (file, index) => {
            const compressedFile = await imageCompression(file, {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
            });
            const imageRef = ref(storage, `work_order_photos/${selectedJob.ordenId}/${selectedJob.id}/${Date.now()}-${compressedFile.name}`);
            const uploadTask = uploadBytesResumable(imageRef, compressedFile);

            return new Promise<string>((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadProgress(prev => {
                            const newProgress = [...prev];
                            newProgress[index] = progress;
                            return newProgress;
                        });
                    },
                    (error) => {
                        console.error("Upload failed for a file:", error);
                        reject(error);
                    },
                    async () => {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        resolve(downloadURL);
                    }
                );
            });
        });

        try {
            const urls = await Promise.all(uploadPromises);
            uploadedImageUrls = [...uploadedImageUrls, ...urls];
        } catch (error) {
            toast({ title: "Error de Subida", description: "Una o más imágenes no pudieron subirse.", variant: "destructive" });
            setIsUpdatingJob(false);
            setIsUploading(false);
            return;
        }

        setIsUploading(false);
    }

    const updates: Partial<Omit<Trabajo, 'id' | 'solicitudId' | 'equipoId' | 'tipoTrabajo'>> = {
      hallazgos: modalHallazgos,
      estado: modalJobStatus,
      fotos: uploadedImageUrls,
    };
    
    if ((modalJobStatus === "Completado" || modalJobStatus === "No Completado") && selectedJob.estado === "Pendiente") {
      updates.fechaFinalizacion = new Date();
      updates.completadoPor = currentUser.uid;
    } else if (modalJobStatus === "Pendiente") {
      updates.fechaFinalizacion = undefined; 
      updates.completadoPor = undefined;
    }

    try {
      await updateTrabajoInOrden(selectedJob.ordenId, selectedJob.id, updates, currentUser.uid);
      toast({ title: "Trabajo Actualizado", description: `El trabajo ${selectedJob.id} ha sido actualizado.` });
      await fetchTechnicianJobs(); 
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error updating job:", error);
      toast({ title: "Error al Actualizar", description: (error as Error).message || "No se pudo actualizar el trabajo.", variant: "destructive" });
    } finally {
      setIsUpdatingJob(false);
    }
  };
  
  const getStatusVariant = (status: Trabajo["estado"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente": return "destructive"; 
      case "Completado": return "default"; 
      case "No Completado": return "secondary"; 
      default: return "outline";
    }
  };
  
  const getStatusColorClass = (status: Trabajo["estado"]): string => {
     switch (status) {
      case "Pendiente": return "bg-yellow-400 text-yellow-900 hover:bg-yellow-500";
      case "Completado": return "bg-green-500 text-white hover:bg-green-600";
      case "No Completado": return "bg-red-500 text-white hover:bg-red-600";
      default: return "border";
    }
  };

  const equipmentForModalMap = selectedJob?.equipoInfo?.coordenadas ? [{
    id: selectedJob.equipoInfo.id,
    coordenadas: selectedJob.equipoInfo.coordenadas,
    tipo: selectedJob.equipoInfo.tipo,
    marca: selectedJob.equipoInfo.marca,
  }] : [];


  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mis Trabajos Asignados" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mis Trabajos Asignados" />

      <Card>
        <CardHeader>
          <CardTitle>Lista de Trabajos ({assignedJobs.length})</CardTitle>
          <CardDescription>Trabajos asignados pendientes o completados por ti.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Trabajo (OT)</TableHead>
                  <TableHead>Equipo (Dirección)</TableHead>
                  <TableHead>Tipo Trabajo</TableHead>
                  <TableHead>Tiempo Est. (min)</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignedJobs.map((job) => {
                  const tipoTrabajoNombre = getTipoTrabajoNombreFromSettings(job.tipoTrabajo, job.equipoId);
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium text-xs" title={job.id}>
                        {job.id} <br/> ({job.ordenDisplayId})
                      </TableCell>
                      <TableCell>
                        <div>{job.equipoId}</div>
                        <div className="text-xs text-muted-foreground" title={job.equipoInfo?.direccion}>{job.equipoInfo?.direccion ? job.equipoInfo.direccion.substring(0,30)+'...' : 'Dirección no disponible'}</div>
                      </TableCell>
                      <TableCell>{tipoTrabajoNombre}</TableCell>
                      <TableCell className="text-center">{job.tiempoServicioEstimado ?? "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(job.estado)} className={getStatusColorClass(job.estado)}>{job.estado}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleOpenJobModal(job)}>
                          {job.estado === "Pendiente" ? <Icons.edit className="mr-2 h-4 w-4" /> : <Icons.view className="mr-2 h-4 w-4" />}
                          {job.estado === "Pendiente" ? "Actualizar" : "Ver"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {assignedJobs.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center h-24">No tienes trabajos asignados o completados.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Trabajo: {selectedJob?.id}</DialogTitle>
            <DialogDescription>
              {selectedJob?.estado === "Pendiente" ? "Registra los detalles de la intervención y actualiza el estado." : "Visualizando detalles del trabajo."}
            </DialogDescription>
          </DialogHeader>
          {selectedJob && (
            <ScrollArea className="max-h-[70vh]">
            <div className="grid gap-4 py-4 pr-3">
               <div>
                <h4 className="font-semibold text-sm">Información del Equipo: {selectedJob.equipoId}</h4>
                <p className="text-xs text-muted-foreground">
                    {selectedJobEquipo?.direccion || 'Dirección no disponible'} <br/>
                    Tipo: {selectedJobEquipo?.tipo || 'N/A'} - Marca: {selectedJobEquipo?.marca || 'N/A'} - Zona: {selectedJobEquipo?.zona || 'N/A'}
                </p>
                 <div className="mt-1 text-xs space-x-1">
                  {selectedJobEquipo?.requiereCanasta && <Badge variant="destructive">Requiere Canasta</Badge>}
                  {selectedJobEquipo?.zonaPeligrosa && <Badge variant="destructive" className="bg-orange-500 text-white">Zona Peligrosa</Badge>}
                </div>
                <div className="h-[200px] w-full bg-muted rounded-md my-2 mt-2 overflow-hidden">
                    {selectedJobEquipo?.coordenadas && equipmentForModalMap.length > 0 ? (
                        <DashboardMap 
                            key={`modal-map-${selectedJobEquipo.id}`} 
                            equipmentLocations={equipmentForModalMap}
                            simpleInfoWindow={true} 
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <Icons.mapPin className="h-8 w-8 text-muted-foreground" />
                            <p className="ml-2 text-xs text-muted-foreground">Ubicación no disponible</p>
                        </div>
                    )}
                </div>
              </div>

              <div>
                <Label htmlFor="trabajoSolicitado">Solicitud (Tipo: {getTipoTrabajoNombreFromSettings(selectedJob.tipoTrabajo, selectedJob.equipoId)})</Label>
                <Textarea 
                  id="trabajoSolicitado" 
                  value={trabajoSolicitado} 
                  rows={3}
                  readOnly 
                  className="bg-muted/50"
                />
                {selectedSolicitudInfo && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Solicitado por: {getUserNameById(selectedSolicitudInfo.creadoPor)}
                        {selectedSolicitudInfo.fechaSolicitud ? ` el ${format(new Date(selectedSolicitudInfo.fechaSolicitud), "dd/MM/yyyy HH:mm", { locale: es })}` : ''}
                        {selectedJob.tiempoServicioEstimado !== undefined && ` (Est: ${selectedJob.tiempoServicioEstimado} min)`}
                    </p>
                )}
              </div>
              <div>
                <Label htmlFor="hallazgos">Acciones realizadas/Hallazgos</Label>
                <Textarea 
                  id="hallazgos" 
                  value={modalHallazgos} 
                  onChange={(e) => setModalHallazgos(e.target.value)} 
                  rows={3}
                  disabled={selectedJob.estado !== "Pendiente" || isUpdatingJob}
                  placeholder={selectedJob.estado === "Pendiente" ? "Resultados, problemas encontrados, etc..." : ""}
                />
                 {selectedJob.estado !== "Pendiente" && selectedJob.completadoPor && selectedJob.fechaFinalizacion && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Registrado por: {getUserNameById(selectedJob.completadoPor)} el {format(new Date(selectedJob.fechaFinalizacion), "dd/MM/yyyy HH:mm", { locale: es })}
                    </p>
                 )}
              </div>
              
               <div>
                <Label>Fotos del Trabajo (Máx. 5)</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(selectedJob?.fotos || []).map((url, index) => (
                      <div key={index} className="relative aspect-square">
                          <a href={url} target="_blank" rel="noopener noreferrer">
                              <Image src={url} alt={`Foto del trabajo ${index + 1}`} layout="fill" className="rounded-md object-cover"/>
                          </a>
                      </div>
                  ))}
                  {imagePreviews.map((preview, index) => (
                       <div key={index} className="relative aspect-square">
                          <Image src={preview} alt={`Vista previa ${index + 1}`} layout="fill" className="rounded-md object-cover"/>
                       </div>
                  ))}
                </div>
                {selectedJob?.estado === "Pendiente" && (
                  <>
                    <Input
                      id="fotos"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileChange}
                      className="mt-2"
                      disabled={isUpdatingJob || isUploading || ((selectedJob?.fotos?.length || 0) + selectedFiles.length) >= 5}
                    />
                    {isUploading && uploadProgress.map((progress, index) => (
                        <Progress key={index} value={progress} className="w-full h-1 mt-1" />
                    ))}
                  </>
                )}
              </div>

              <div>
                <Label htmlFor="status">Estado del Trabajo</Label>
                <Select 
                  value={modalJobStatus} 
                  onValueChange={(value) => setModalJobStatus(value as Trabajo["estado"])}
                  disabled={selectedJob.estado !== "Pendiente" || isUpdatingJob}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Completado">Completado</SelectItem>
                    <SelectItem value="No Completado">No Completado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
               {selectedJob.estado !== "Pendiente" && selectedJob.completadoPor && selectedJob.estado !== "Pendiente" && selectedJob.fechaFinalizacion === undefined && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Completado por: {getUserNameById(selectedJob.completadoPor)} (Fecha no disponible)
                  </div>
               )}
            </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isUpdatingJob}>Cancelar</Button>
            {selectedJob?.estado === "Pendiente" && (
              <Button onClick={handleUpdateJob} disabled={isUpdatingJob || isUploading}>
                {isUpdatingJob ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.save className="mr-2 h-4 w-4" />}
                Guardar Cambios
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
