
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Icons } from "@/components/icons";
import type { Solicitud, Equipo, AppSettingOption, AppSettingsState, TipoTrabajoDetallado } from "@/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getEquipos } from "@/services/equipmentService";
import { addSolicitud, getPendingRequestForEquipment, deleteSolicitud } from "@/services/requestService";
import { getAppSettings } from "@/services/settingsService"; 
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
import { ScrollArea } from "@/components/ui/scroll-area";


const PLACEHOLDER_VALUE_NO_OPTIONS = "__NO_OPTIONS_PLACEHOLDER__";

export default function CreateRequestPage() {
  const [fechaProgramada, setFechaProgramada] = useState<Date | undefined>(new Date());
  const [equiposList, setEquiposList] = useState<Equipo[]>([]);
  const [equipoComboboxOptions, setEquipoComboboxOptions] = useState<ComboboxOption[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [availableTiposTrabajo, setAvailableTiposTrabajo] = useState<TipoTrabajoDetallado[]>([]);
  
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const router = useRouter();

  // Form state
  const [selectedEquipo, setSelectedEquipo] = useState<string>("");
  const [tipoTrabajo, setTipoTrabajo] = useState<string>(""); // Ahora es el ID del TipoTrabajoDetallado
  const [urgencia, setUrgencia] = useState<Solicitud["urgencia"]>("Normal");
  const [descripcion, setDescripcion] = useState<string>("");
  
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [pendingRequestToDelete, setPendingRequestToDelete] = useState<Solicitud | null>(null);
  const [newRequestDataForConfirmation, setNewRequestDataForConfirmation] = useState<Omit<Solicitud, 'id' | 'fechaSolicitud' | 'estado' | 'displayId'> & { creadoPor: string; fechaProgramada: Date; descripcion?: string; tiempoServicioEstimado?: number; } | null>(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoadingInitialData(true);
      try {
        const [fetchedEquipos, fetchedAppSettings] = await Promise.all([
          getEquipos(),
          getAppSettings()
        ]);

        setEquiposList(fetchedEquipos);
        setAppSettings(fetchedAppSettings);
        
        const activeEquipos = fetchedEquipos.filter(eq => eq.estado === "Activo");
        setEquipoComboboxOptions(
          activeEquipos.map(eq => {
            const marca = eq.marca || "Sin marca";
            let direccionDisplay = eq.direccion || "Sin dirección";
            if (direccionDisplay.length > 50) {
              direccionDisplay = `${direccionDisplay.substring(0, 50)}...`;
            }
            return {
              value: eq.id,
              label: `${eq.id} (${marca}) (${direccionDisplay})`
            };
          })
        );

      } catch (error) {
        console.error("Error fetching initial data for create request page:", error);
        toast({
          title: "Error al Cargar Datos",
          description: "No se pudieron obtener los equipos o configuraciones.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingInitialData(false);
      }
    };
    fetchInitialData();
  }, [toast]);

  useEffect(() => {
    if (selectedEquipo && appSettings) {
      const equipoSeleccionado = equiposList.find(eq => eq.id === selectedEquipo);
      if (equipoSeleccionado) {
        const tipoEquipoConfig = appSettings.tiposEquipos.find(te => te.value === equipoSeleccionado.tipo);
        setAvailableTiposTrabajo(tipoEquipoConfig?.tiposDeTrabajoAsociados || []);
        setTipoTrabajo(""); 
      } else {
        setAvailableTiposTrabajo([]);
      }
    } else {
      setAvailableTiposTrabajo([]);
    }
  }, [selectedEquipo, appSettings, equiposList]);


  const proceedWithAddSolicitud = async (data: Omit<Solicitud, 'id' | 'fechaSolicitud' | 'estado' | 'displayId'> & { creadoPor: string; fechaProgramada: Date; descripcion?: string; tiempoServicioEstimado?: number; }) => {
    setIsSubmitting(true);
    try {
      const createdSolicitud = await addSolicitud(data);
      setSelectedEquipo("");
      setTipoTrabajo("");
      setUrgencia("Normal");
      setDescripcion("");
      setFechaProgramada(new Date());
      setAvailableTiposTrabajo([]);
      toast({ title: "Solicitud Creada", description: `La solicitud ${createdSolicitud.displayId || createdSolicitud.id} ha sido creada con éxito.` });
    } catch (error) {
      console.error("[CreateRequestPage] Error in proceedWithAddSolicitud:", error);
      toast({
        title: "Error al Crear Solicitud",
        description: (error as Error).message || "No se pudo guardar la solicitud en Firestore.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsSubmitting(false);
      setNewRequestDataForConfirmation(null);
      setPendingRequestToDelete(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEquipo) {
      toast({ title: "Validación Requerida", description: "Por favor, seleccione un equipo.", variant: "destructive" });
      return;
    }
    if (!tipoTrabajo) {
      toast({ title: "Validación Requerida", description: "Por favor, seleccione un tipo de trabajo.", variant: "destructive" });
      return;
    }
    if (!currentUser) {
      toast({ title: "Error de Autenticación", description: "No se pudo identificar al usuario. Por favor, inicie sesión de nuevo.", variant: "destructive" });
      return;
    }
    if (!fechaProgramada) {
      toast({ title: "Validación Requerida", description: "Por favor, seleccione una fecha programada.", variant: "destructive" });
      return;
    }

    const equipoDetails = equiposList.find(eq => eq.id === selectedEquipo);
    if (equipoDetails && equipoDetails.estado === "Dado de baja") {
        toast({ title: "Equipo No Válido", description: `El equipo ${selectedEquipo} está dado de baja y no se puede usar para nuevas solicitudes. Refresque la lista de equipos.`, variant: "destructive" });
        return;
    }

    let tiempoEstimado = 0;
    if (equipoDetails && appSettings) {
        const tipoEquipoConfig = appSettings.tiposEquipos.find(te => te.value === equipoDetails.tipo);
        const trabajoConfig = tipoEquipoConfig?.tiposDeTrabajoAsociados.find(tt => tt.id === tipoTrabajo);
        if (trabajoConfig) {
            tiempoEstimado = trabajoConfig.tiempoEstimadoMinutos;
        }
    }

    const currentRequestPayload: Omit<Solicitud, 'id' | 'fechaSolicitud' | 'estado' | 'displayId'> & { creadoPor: string; fechaProgramada: Date; descripcion?: string; tiempoServicioEstimado?: number } = {
      equipoId: selectedEquipo,
      tipoTrabajo: tipoTrabajo, 
      tiempoServicioEstimado: tiempoEstimado,
      urgencia,
      creadoPor: currentUser.uid,
      fechaProgramada: fechaProgramada,
    };
    if (descripcion && descripcion.trim() !== "") {
      currentRequestPayload.descripcion = descripcion.trim();
    }

    setIsSubmitting(true);

    try {
      const existingPendingRequest = await getPendingRequestForEquipment(selectedEquipo);
      if (existingPendingRequest) {
        setPendingRequestToDelete(existingPendingRequest);
        setNewRequestDataForConfirmation(currentRequestPayload);
        setIsAlertOpen(true);
        setIsSubmitting(false);
      } else {
        await proceedWithAddSolicitud(currentRequestPayload);
      }
    } catch (error) {
      toast({
        title: "Error de Verificación",
        description: "No se pudo verificar si existen solicitudes pendientes. Intente de nuevo.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteAndCreate = async () => {
    setIsAlertOpen(false);
    if (pendingRequestToDelete && newRequestDataForConfirmation) {
      setIsSubmitting(true);
      try {
        await deleteSolicitud(pendingRequestToDelete.id);
        toast({ title: "Solicitud Eliminada", description: `La solicitud ${pendingRequestToDelete.displayId || pendingRequestToDelete.id} fue eliminada.` });
        await proceedWithAddSolicitud(newRequestDataForConfirmation);
      } catch (error) {
        console.error("[CreateRequestPage] Error in handleConfirmDeleteAndCreate:", error);
        toast({
          title: "Error en Operación",
          description: `Error: ${(error as Error).message || "No se pudo eliminar la antigua y/o crear la nueva solicitud."}`,
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleCancelDelete = () => {
    setIsAlertOpen(false);
    setPendingRequestToDelete(null);
    setNewRequestDataForConfirmation(null);
    toast({ title: "Operación Cancelada", description: "La nueva solicitud no fue creada." });
  };

  const handleCannedResponseClick = (text: string) => {
    setDescripcion(prev => prev ? `${prev.trim()} ${text}` : text);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Crear Nueva Solicitud" />

      <div className="max-w-2xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle>Detalles de la Solicitud</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="grid gap-4">
              <div>
                <Label htmlFor="equipo">Equipo (Solo equipos activos)</Label>
                <Combobox
                  options={equipoComboboxOptions}
                  value={selectedEquipo}
                  onValueChange={setSelectedEquipo}
                  placeholder={isLoadingInitialData ? "Cargando equipos..." : "Seleccionar equipo"}
                  searchPlaceholder="Buscar equipo..."
                  notFoundMessage={isLoadingInitialData ? "Cargando..." : "No se encontró equipo activo."}
                  disabled={isLoadingInitialData || isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor="tipoTrabajo">Tipo de Trabajo</Label>
                <Select 
                    value={tipoTrabajo} 
                    onValueChange={(v) => setTipoTrabajo(v)} 
                    disabled={isSubmitting || !selectedEquipo || availableTiposTrabajo.length === 0}
                >
                  <SelectTrigger id="tipoTrabajo">
                    <SelectValue placeholder={!selectedEquipo ? "Seleccione un equipo primero" : "Seleccionar tipo de trabajo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTiposTrabajo.length > 0 ? (
                        availableTiposTrabajo.map(tt => (
                            <SelectItem key={tt.id} value={tt.id}>
                                {tt.nombre} ({tt.tiempoEstimadoMinutos} min)
                            </SelectItem>
                        ))
                    ) : (
                        <SelectItem value={PLACEHOLDER_VALUE_NO_OPTIONS} disabled>
                            {selectedEquipo ? "No hay trabajos para este tipo de equipo" : "Seleccione un equipo"}
                        </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="urgencia">Urgencia</Label>
                <Select value={urgencia} onValueChange={(v) => setUrgencia(v as Solicitud["urgencia"])} disabled={isSubmitting}>
                  <SelectTrigger id="urgencia"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {appSettings?.urgenciasSolicitudes.map(urg => (
                      <SelectItem key={urg.value} value={urg.value}>{urg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fechaProgramada">Fecha Programada</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal"
                      disabled={isSubmitting}
                    >
                      <Icons.calendar className="mr-2 h-4 w-4" />
                      {fechaProgramada ? format(fechaProgramada, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fechaProgramada}
                      onSelect={setFechaProgramada}
                      initialFocus
                      locale={es}
                      disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="descripcion">Descripción (Opcional)</Label>
                <Textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles adicionales..." disabled={isSubmitting} rows={3}/>
                {appSettings?.respuestasPredefinidasSolicitudes && appSettings.respuestasPredefinidasSolicitudes.length > 0 && (
                    <ScrollArea className="h-20 mt-2 border rounded-md p-1.5">
                        <div className="flex flex-wrap gap-1">
                            {appSettings.respuestasPredefinidasSolicitudes.map(response => (
                                <Button
                                    key={response.value}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-auto py-1 px-2"
                                    onClick={() => handleCannedResponseClick(response.value)}
                                    disabled={isSubmitting}
                                >
                                    {response.label}
                                </Button>
                            ))}
                        </div>
                    </ScrollArea>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={isLoadingInitialData || isSubmitting || !selectedEquipo || !tipoTrabajo}>
                {isSubmitting ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.add className="mr-2 h-4 w-4" />}
                Crear Solicitud
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/requests')} disabled={isSubmitting}>
                <Icons.chevronLeft className="mr-2 h-4 w-4" /> Volver al Listado
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitud Pendiente Existente</AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe una solicitud pendiente (ID: {pendingRequestToDelete?.displayId || pendingRequestToDelete?.id}) para el equipo {pendingRequestToDelete?.equipoId}.
              <br />
              Tipo: {pendingRequestToDelete?.tipoTrabajo}, Programada para: {pendingRequestToDelete?.fechaProgramada ? format(new Date(pendingRequestToDelete.fechaProgramada), "dd/MM/yyyy") : 'N/A'}.
              <br /><br />
              ¿Desea eliminar esta solicitud pendiente y crear la nueva?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete} disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteAndCreate} disabled={isSubmitting}>
              {isSubmitting ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar y Crear Nueva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
