
"use client";

import type React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from "@/contexts/AuthContext";
import { getMaintenancePlanById, updateMaintenancePlan } from "@/services/maintenanceService";
import { addSolicitud } from "@/services/requestService";
import type { PlanDeMantenimiento, UserProfile, MantenimientoProgramado } from "@/types";
import { getUsers } from "@/services/userService";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
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
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";


export default function MaintenancePlanDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const [plan, setPlan] = useState<PlanDeMantenimiento | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfirmGenerateOpen, setIsConfirmGenerateOpen] = useState(false);
  
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  
  const scheduledDays = useMemo(() => plan?.calendario.map(item => new Date(item.fechaProgramada)) || [], [plan]);
  
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | undefined>(
    scheduledDays.length > 0 ? scheduledDays[0] : new Date()
  );

  const scheduledItemsForSelectedDay = useMemo(() => {
    if (!selectedCalendarDay || !plan) return [];
    return plan.calendario.filter(item => isSameDay(new Date(item.fechaProgramada), selectedCalendarDay));
  }, [plan, selectedCalendarDay]);


  const fetchPlanDetails = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [fetchedPlan, fetchedUsers] = await Promise.all([
        getMaintenancePlanById(id),
        getUsers(),
      ]);

      if (fetchedPlan) {
        setPlan(fetchedPlan);
      } else {
        toast({ title: "Error", description: `Plan de mantenimiento con ID ${id} no encontrado.`, variant: "destructive" });
      }
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching maintenance plan details:", error);
      toast({ title: "Error al Cargar Datos", description: "No se pudo obtener la información del plan de mantenimiento.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchPlanDetails();
  }, [fetchPlanDetails]);

  const handleGenerateRequests = async () => {
    setIsConfirmGenerateOpen(false);
    if (!plan || !currentUser) {
      toast({ title: "Error", description: "No se puede generar solicitudes sin un plan o usuario válido.", variant: "destructive" });
      return;
    }

    const itemsToProcess = plan.calendario.filter(item => item.estado === 'programado');
    if (itemsToProcess.length === 0) {
      toast({ title: "Información", description: "No hay mantenimientos programados para generar nuevas solicitudes.", variant: "default" });
      return;
    }

    setIsGenerating(true);
    toast({ title: "Generando Solicitudes...", description: `Procesando ${itemsToProcess.length} mantenimientos.` });

    let successCount = 0;
    const errors: string[] = [];
    const updatedCalendario = [...plan.calendario];

    for (const item of itemsToProcess) {
      try {
        const newSolicitudPayload = {
          equipoId: item.equipoId,
          tipoTrabajo: "mantenimiento_preventivo", // Asumiendo un ID genérico
          urgencia: "Normal",
          creadoPor: currentUser.uid,
          fechaProgramada: item.fechaProgramada,
          descripcion: `Mantenimiento preventivo programado desde el plan '${plan.nombre}'. Motivo: ${item.motivoPrioridad}`,
        };
        // @ts-ignore
        const createdSolicitud = await addSolicitud(newSolicitudPayload);
        
        const itemIndex = updatedCalendario.findIndex(calItem => calItem.equipoId === item.equipoId && calItem.fechaProgramada === item.fechaProgramada);
        if (itemIndex !== -1) {
          updatedCalendario[itemIndex] = {
            ...updatedCalendario[itemIndex],
            estado: 'solicitud_creada',
            solicitudId: createdSolicitud.id,
          };
        }
        successCount++;
      } catch (error) {
        errors.push(`Error creando solicitud para equipo ${item.equipoId}: ${(error as Error).message}`);
      }
    }

    try {
      await updateMaintenancePlan(plan.id, { calendario: updatedCalendario });
      setPlan(prev => prev ? { ...prev, calendario: updatedCalendario } : null);
    } catch(updateError) {
      errors.push(`Error actualizando el plan de mantenimiento: ${(updateError as Error).message}`);
    }


    setIsGenerating(false);
    if (errors.length > 0) {
      toast({
        title: "Proceso Completado con Errores",
        description: `${successCount} solicitudes creadas. ${errors.length} errores ocurrieron. Revise la consola.`,
        variant: "destructive",
        duration: 10000,
      });
      console.error("Errores al generar solicitudes:", errors);
    } else {
      toast({
        title: "Proceso Completado",
        description: `${successCount} solicitudes de mantenimiento han sido creadas exitosamente.`,
      });
    }
  };


  const getUserName = (userId: string) => users.find(u => u.id === userId)?.nombre || userId;

  const getStatusVariant = (status: MantenimientoProgramado['estado']) => {
    switch (status) {
      case 'programado': return 'secondary';
      case 'solicitud_creada': return 'default';
      case 'completado_ot': return 'outline';
      default: return 'outline';
    }
  };
  
  const getStatusColorClass = (status: MantenimientoProgramado['estado']): string => {
    switch (status) {
      case 'programado': return "bg-yellow-400 text-yellow-900";
      case 'solicitud_creada': return "bg-blue-500 text-white";
      case 'completado_ot': return "bg-green-500 text-white";
      default: return "border";
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Cargando Plan de Mantenimiento..." />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Plan no Encontrado" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">El plan de mantenimiento con ID '{id}' no fue encontrado.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const hasPendingItems = plan.calendario.some(item => item.estado === 'programado');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={plan.nombre}>
        <Button onClick={() => setIsConfirmGenerateOpen(true)} disabled={isGenerating || !hasPendingItems}>
          {isGenerating ? <Icons.loader className="mr-2 h-4 w-4 animate-spin"/> : <Icons.add className="mr-2 h-4 w-4" />}
          Generar Solicitudes Pendientes
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Detalles del Plan</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div><Label>Nombre:</Label><p>{plan.nombre}</p></div>
                        <div><Label>Fecha Creación:</Label><p>{format(plan.fechaCreacion, "dd/MM/yyyy HH:mm")}</p></div>
                        <div><Label>Creado Por:</Label><p>{getUserName(plan.creadoPor)}</p></div>
                        <div><Label>Duración del Plan:</Label><p>{plan.tiempoDeEjecucionDias} días</p></div>
                        <div className="md:col-span-2"><Label>Estado del Plan:</Label><div><Badge>{plan.estado}</Badge></div></div>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-1">
                <Card className="sticky top-20">
                    <CardHeader>
                        <CardTitle>Estadísticas y Criterios</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {plan.estadisticas && (
                        <div className="space-y-1 text-sm">
                            <p><strong>Equipos Considerados:</strong> {plan.estadisticas.totalEquiposConsiderados}</p>
                            <p><strong>Equipos Excluidos:</strong> {plan.estadisticas.totalEquiposExcluidos}</p>
                            <p><strong>Mantenimientos Programados:</strong> {plan.estadisticas.totalMantenimientosProgramados}</p>
                        </div>
                        )}
                        <div>
                            <Label>Criterios de Exclusión Aplicados</Label>
                            <ScrollArea className="h-32 mt-1 border rounded-md p-2 text-xs bg-muted/50">
                                {plan.exclusiones.length > 0 ? (
                                    <ul className="list-disc list-inside">
                                    {plan.exclusiones.map((ex, index) => (
                                        <li key={index}>Excluir si <strong>{ex.campo}</strong> es <strong>{String(ex.valor)}</strong></li>
                                    ))}
                                    </ul>
                                ) : (<p className="text-muted-foreground text-center pt-4">No se aplicaron exclusiones.</p>)}
                            </ScrollArea>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        <Card>
            <CardHeader>
            <div className="flex justify-between items-center">
                <div>
                    <CardTitle>Calendario de Mantenimiento ({plan.calendario.length})</CardTitle>
                    <CardDescription>Lista de equipos programados para mantenimiento preventivo.</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')}>
                        <Icons.list className="mr-2 h-4 w-4" />
                        Lista
                    </Button>
                    <Button variant={viewMode === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('calendar')}>
                        <Icons.calendar className="mr-2 h-4 w-4" />
                        Calendario
                    </Button>
                </div>
            </div>
            </CardHeader>
            <CardContent>
            {viewMode === 'list' ? (
                <ScrollArea className="h-[500px]">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Equipo ID</TableHead>
                            <TableHead>Fecha Programada</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>ID Solicitud</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {plan.calendario.map((item, index) => (
                            <TableRow key={`${item.equipoId}-${index}`}>
                                <TableCell>
                                    <Link href={`/equipment/${item.equipoId}`} className="text-primary hover:underline">
                                        {item.equipoId}
                                    </Link>
                                </TableCell>
                                <TableCell>{format(item.fechaProgramada, "dd/MM/yyyy")}</TableCell>
                                <TableCell><Badge className={getStatusColorClass(item.estado)}>{(item.estado || 'programado').replace('_', ' ')}</Badge></TableCell>
                                <TableCell>
                                    {item.solicitudId ? (
                                        <Link href={`/requests`} className="text-primary hover:underline text-xs" title={item.solicitudId}>
                                            {item.solicitudId.substring(0, 8)}...
                                        </Link>
                                    ) : "N/A"}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </ScrollArea>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Calendar
                        mode="single"
                        selected={selectedCalendarDay}
                        onSelect={setSelectedCalendarDay}
                        modifiers={{ scheduled: scheduledDays }}
                        modifiersClassNames={{ scheduled: "font-bold bg-primary/10 border border-primary/20" }}
                        month={plan.calendario.length > 0 ? new Date(plan.calendario[0].fechaProgramada) : new Date()}
                        locale={es}
                        className="border rounded-md p-0"
                    />
                    <div className="border rounded-md p-4">
                        <h4 className="font-semibold mb-2 text-md">
                            {selectedCalendarDay ? `Programado para el ${format(selectedCalendarDay, "dd 'de' MMMM", { locale: es })}` : "Seleccione una fecha"}
                        </h4>
                        <ScrollArea className="h-[280px]">
                            {scheduledItemsForSelectedDay.length > 0 ? (
                                <ul className="space-y-3">
                                    {scheduledItemsForSelectedDay.map((item, index) => (
                                        <li key={`${item.equipoId}-${index}`} className="text-sm p-2 bg-background rounded-md border">
                                            <div className="flex items-center justify-between">
                                                <Link href={`/equipment/${item.equipoId}`} className="text-primary hover:underline font-semibold">
                                                    {item.equipoId}
                                                </Link>
                                                <Badge className={getStatusColorClass(item.estado)}>{(item.estado || 'programado').replace('_', ' ')}</Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1 truncate" title={item.motivoPrioridad}>{item.motivoPrioridad}</p>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="flex items-center justify-center h-full">
                                    <p className="text-sm text-muted-foreground text-center">{selectedCalendarDay ? "No hay mantenimientos programados para este día." : "Seleccione un día en el calendario para ver detalles."}</p>
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </div>
            )}
            </CardContent>
        </Card>
      </div>
      
      <AlertDialog open={isConfirmGenerateOpen} onOpenChange={setIsConfirmGenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar Generación de Solicitudes?</AlertDialogTitle>
            <AlertDialogDescription>
              Se crearán solicitudes de mantenimiento para los {plan.calendario.filter(i => i.estado === 'programado').length} equipos programados que aún no tienen una. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsConfirmGenerateOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateRequests}>Sí, Generar Solicitudes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
