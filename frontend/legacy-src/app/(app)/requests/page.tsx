
"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { Solicitud, UserProfile, OrdenDeTrabajo, Trabajo, AppSettingsState, TipoEquipoConTrabajos } from "@/types";
import { format, isValid, startOfDay, endOfDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getSolicitudes, updateSolicitudEstado } from "@/services/requestService";
import { getUsers } from "@/services/userService";
import { getWorkOrders, cancelTrabajoInOrdenBySolicitudId, updateTrabajoInOrden, getWorkOrderById } from "@/services/workOrderService"; 
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getEquipos } from "@/services/equipmentService"; // Para obtener el tipo de equipo
import { getAppSettings } from "@/services/settingsService"; // Para obtener nombres de tipo de trabajo

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as AlertDialogContentComponent, 
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader as DialogHeaderComponent, DialogTitle as DialogTitleComponent, DialogDescription as DialogDescriptionComponent, DialogFooter as DialogFooterComponent } from "@/components/ui/dialog";


const ALL_ITEMS_FILTER_VALUE = "__ALL_ITEMS__";

const URGENCIA_OPTIONS: { value: Solicitud["urgencia"]; label: string }[] = [
  { value: "Urgente", label: "Urgente" },
  { value: "Normal", label: "Normal" },
];

const ESTADO_OPTIONS: { value: Solicitud["estado"]; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "asignada", label: "Asignada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "completada", label: "Completada" },
  { value: "no_completada", label: "No Completada" },
];

const SOLICITUD_REVIEW_STATUS_OPTIONS: { value: Solicitud["estado"]; label: string }[] = [
  { value: "completada", label: "Completada (Mantener)" },
  { value: "no_completada", label: "No Completada (Revertir)" },
];


export default function RequestsListPage() {
  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<Solicitud[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<OrdenDeTrabajo[]>([]);
  const [solicitudToOrdenMap, setSolicitudToOrdenMap] = useState<Map<string, { ordenId: string; ordenDisplayId: string; trabajoId: string; trabajo?: Trabajo }>>(new Map());
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [equiposData, setEquiposData] = useState<Pick<Equipo, 'id' | 'tipo'>[]>([]);


  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { currentUser, userProfile } = useAuth();

  const [searchText, setSearchText] = useState("");
  const [selectedTipoTrabajoId, setSelectedTipoTrabajoId] = useState<string>(""); // Ahora es el ID del tipo de trabajo
  const [selectedCreadoPor, setSelectedCreadoPor] = useState<string>("");
  const [selectedUrgencia, setSelectedUrgencia] = useState<string>("");
  const [selectedEstado, setSelectedEstado] = useState<string>("");
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [requestToCancel, setRequestToCancel] = useState<Solicitud | null>(null);
  const [cancelationReason, setCancelationReason] = useState("");

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [requestToReview, setRequestToReview] = useState<Solicitud | null>(null);
  const [associatedTrabajo, setAssociatedTrabajo] = useState<Trabajo | null>(null);
  const [reviewObservation, setReviewObservation] = useState("");
  const [newReviewStatus, setNewReviewStatus] = useState<Solicitud["estado"]>("completada");
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);

  const canCreateRequest = useMemo(() => {
    if (!userProfile) return false;
    return userProfile.perfiles.includes("administrador") || userProfile.perfiles.includes("supervisor") || userProfile.perfiles.includes("ingenieroDeOficina");
  }, [userProfile]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [fetchedRequests, fetchedUsers, fetchedWorkOrders, fetchedAppSettings, fetchedEquipos] = await Promise.all([
        getSolicitudes(),
        getUsers(),
        getWorkOrders(),
        getAppSettings(),
        getEquipos().then(eqs => eqs.map(eq => ({ id: eq.id, tipo: eq.tipo }))),
      ]);
      setRequests(fetchedRequests.sort((a,b) => new Date(b.fechaSolicitud).getTime() - new Date(a.fechaSolicitud).getTime()));
      setUsers(fetchedUsers);
      setAllWorkOrders(fetchedWorkOrders);
      setAppSettings(fetchedAppSettings);
      setEquiposData(fetchedEquipos);

      const newSolicitudToOrdenMap = new Map<string, { ordenId: string; ordenDisplayId: string; trabajoId: string; trabajo?: Trabajo }>();
      fetchedWorkOrders.forEach(order => {
        order.trabajos.forEach(trabajo => {
          if (trabajo.solicitudId) {
            newSolicitudToOrdenMap.set(trabajo.solicitudId, { ordenId: order.id, ordenDisplayId: order.displayId, trabajoId: trabajo.id, trabajo: trabajo });
          }
        });
      });
      setSolicitudToOrdenMap(newSolicitudToOrdenMap);

      if (currentUser && userProfile && userProfile.perfiles.includes("ingenieroDeOficina") && selectedCreadoPor === "") {
        setSelectedCreadoPor(currentUser.uid);
      }

    } catch (error) {
      console.error("Error fetching initial data for requests list:", error);
      toast({
        title: "Error al Cargar Datos",
        description: "No se pudieron obtener los datos iniciales.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchAllData();
  }, []); 

  const tiposTrabajoOptions = useMemo(() => {
    if (!appSettings) return [];
    const allTrabajos = new Map<string, string>(); // id -> nombre
    appSettings.tiposEquipos.forEach(tipoEq => {
      tipoEq.tiposDeTrabajoAsociados.forEach(trabajo => {
        if (!allTrabajos.has(trabajo.id)) {
          allTrabajos.set(trabajo.id, trabajo.nombre);
        }
      });
    });
    return Array.from(allTrabajos, ([id, nombre]) => ({ value: id, label: nombre }));
  }, [appSettings]);

  const getTipoTrabajoNombre = (tipoTrabajoId: string, equipoId?: string): string => {
    if (!appSettings || !tipoTrabajoId) return tipoTrabajoId;
    const equipo = equiposData.find(e => e.id === equipoId);
    if (equipo) {
      const tipoEquipoConfig = appSettings.tiposEquipos.find(te => te.value === equipo.tipo);
      const trabajoConfig = tipoEquipoConfig?.tiposDeTrabajoAsociados.find(tt => tt.id === tipoTrabajoId);
      if (trabajoConfig) return trabajoConfig.nombre;
    }
    // Fallback to generic search if equipo type not found or trabajo not specific
    for (const te of appSettings.tiposEquipos) {
      const trabajo = te.tiposDeTrabajoAsociados.find(tt => tt.id === tipoTrabajoId);
      if (trabajo) return trabajo.nombre;
    }
    return tipoTrabajoId; // Return ID if no name found
  };


  useEffect(() => {
    let tempFiltered = [...requests];

    if (searchText.trim()) {
      const lowerSearchText = searchText.toLowerCase();
      tempFiltered = tempFiltered.filter(
        (req) =>
          (req.displayId && req.displayId.toLowerCase().includes(lowerSearchText)) ||
          req.equipoId.toLowerCase().includes(lowerSearchText) ||
          (req.descripcion && req.descripcion.toLowerCase().includes(lowerSearchText)) ||
          (getTipoTrabajoNombre(req.tipoTrabajo, req.equipoId).toLowerCase().includes(lowerSearchText))
      );
    }

    if (selectedTipoTrabajoId) { // Filtrar por ID de tipo de trabajo
      tempFiltered = tempFiltered.filter((req) => req.tipoTrabajo === selectedTipoTrabajoId);
    }

    if (selectedCreadoPor) { 
      tempFiltered = tempFiltered.filter((req) => req.creadoPor === selectedCreadoPor);
    }

    if (selectedUrgencia) {
      tempFiltered = tempFiltered.filter((req) => req.urgencia === selectedUrgencia);
    }

    if (selectedEstado) {
      tempFiltered = tempFiltered.filter((req) => req.estado === selectedEstado);
    }

    if (filterDateRange?.from) {
        const fromDate = startOfDay(filterDateRange.from);
        tempFiltered = tempFiltered.filter(req => {
            const reqDate = new Date(req.fechaSolicitud);
            return isValid(reqDate) && reqDate >= fromDate;
        });
    }
    if (filterDateRange?.to) {
        const toDate = endOfDay(filterDateRange.to);
        tempFiltered = tempFiltered.filter(req => {
            const reqDate = new Date(req.fechaSolicitud);
            return isValid(reqDate) && reqDate <= toDate;
        });
    }

    setFilteredRequests(tempFiltered);
  }, [searchText, selectedTipoTrabajoId, selectedCreadoPor, selectedUrgencia, selectedEstado, filterDateRange, requests, appSettings, equiposData]);


  const handleClearFilters = () => {
    setSearchText("");
    setSelectedTipoTrabajoId("");
    if (currentUser && userProfile && userProfile.perfiles.includes("ingenieroDeOficina")) {
        setSelectedCreadoPor(currentUser.uid);
    } else {
        setSelectedCreadoPor("");
    }
    setSelectedUrgencia("");
    setSelectedEstado("");
    setFilterDateRange(undefined);
  };

  const getUserName = (userId: string): string => {
    const user = users.find(u => u.id === userId);
    return user ? user.nombre : userId;
  };

  const getStatusVariant = (status: Solicitud["estado"] | Solicitud["urgencia"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "pendiente": return "destructive";
      case "Urgente": return "destructive";
      case "asignada": return "default";
      case "Normal": return "default";
      case "cancelada": return "secondary";
      case "completada": return "default";
      case "no_completada": return "secondary";
      default: return "outline";
    }
  };

  const getStatusColorClass = (status: Solicitud["estado"] | Solicitud["urgencia"]): string => {
     switch (status) {
      case "pendiente": return "bg-yellow-400 text-yellow-900 hover:bg-yellow-500";
      case "Urgente": return "bg-red-500 text-white hover:bg-red-600";
      case "asignada": return "bg-blue-500 text-white hover:bg-blue-600"; 
      case "Normal": return "bg-primary text-primary-foreground"; 
      case "cancelada": return "bg-gray-500 text-white hover:bg-gray-600";
      case "completada": return "bg-green-500 text-white hover:bg-green-600";
      case "no_completada": return "bg-orange-500 text-white hover:bg-orange-600";
      default: return "";
    }
  }

  const canUserCancelRequest = (request: Solicitud): boolean => {
    if (!userProfile) return false;
    const canPerformAction = userProfile.perfiles.includes("ingenieroDeOficina") ||
                             userProfile.perfiles.includes("administrador") ||
                             userProfile.perfiles.includes("supervisor");
    return canPerformAction && (request.estado === "pendiente" || request.estado === "asignada");
  };

  const canUserReviewRequest = (request: Solicitud): boolean => {
    if (!userProfile) return false;
    const canPerformAction = userProfile.perfiles.includes("ingenieroDeOficina") ||
                             userProfile.perfiles.includes("administrador") ||
                             userProfile.perfiles.includes("supervisor");
    return canPerformAction && (request.estado === "completada" || request.estado === "no_completada");
  };


  const handleInitiateCancelRequest = (request: Solicitud) => {
    setRequestToCancel(request);
    setCancelationReason(""); 
    setIsCancelConfirmOpen(true);
  };

  const handleConfirmCancelRequest = async () => {
    if (!requestToCancel || !currentUser) return;

    if (requestToCancel.estado === 'asignada' && cancelationReason.trim() === "") {
      toast({ title: "Error", description: "El motivo de cancelación es obligatorio para solicitudes asignadas.", variant: "destructive"});
      return;
    }

    setIsLoading(true);
    try {
      if (requestToCancel.estado === 'asignada') {
        await cancelTrabajoInOrdenBySolicitudId(requestToCancel.id, cancelationReason.trim(), currentUser.uid);
        toast({ title: "Trabajo Asociado Cancelado", description: `El trabajo para la solicitud ${requestToCancel.displayId || requestToCancel.id} ha sido cancelado.`, duration: 4000 });
      }
      await updateSolicitudEstado(requestToCancel.id, "cancelada", cancelationReason.trim());
      toast({ title: "Solicitud Cancelada", description: `La solicitud ${requestToCancel.displayId || requestToCancel.id} ha sido cancelada.` });
      
      await fetchAllData(); 
    } catch (error) {
      console.error("Error during cancellation process:", error);
      toast({ title: "Error al Cancelar", description: (error as Error).message || "No se pudo completar la cancelación.", variant: "destructive" });
    } finally {
      setIsCancelConfirmOpen(false);
      setRequestToCancel(null);
      setCancelationReason("");
      setIsLoading(false);
    }
  };

  const handleOpenReviewModal = (request: Solicitud) => {
    const ordenTrabajoInfo = solicitudToOrdenMap.get(request.id);
    const trabajo = ordenTrabajoInfo?.trabajo;

    setRequestToReview(request);
    setAssociatedTrabajo(trabajo || null);
    setReviewObservation(trabajo?.observacionIngeniero || "");
    setNewReviewStatus(request.estado); 
    setIsReviewModalOpen(true);
  };

  const handleConfirmReview = async () => {
    if (!requestToReview || !currentUser) return;
    setIsUpdatingReview(true);

    try {
      const ordenInfo = solicitudToOrdenMap.get(requestToReview.id);
      if (ordenInfo && ordenInfo.trabajoId) {
        const trabajoUpdates: Partial<Omit<Trabajo, 'id' | 'solicitudId' | 'equipoId' | 'tipoTrabajo'>> = {
          observacionIngeniero: reviewObservation.trim() || undefined, 
        };

        if (newReviewStatus === "no_completada") {
          trabajoUpdates.estado = "No Completado";
        } else if (newReviewStatus === "completada") {
          trabajoUpdates.estado = "Completado";
        }
        
        await updateTrabajoInOrden(ordenInfo.ordenId, ordenInfo.trabajoId, trabajoUpdates, currentUser.uid);
      }

      if (requestToReview.estado !== newReviewStatus) {
        await updateSolicitudEstado(requestToReview.id, newReviewStatus, newReviewStatus === 'cancelada' ? "Cancelada por ingeniero" : undefined);
      }

      toast({ title: "Revisión Guardada", description: `La solicitud ${requestToReview.displayId || requestToReview.id} ha sido actualizada.` });
      await fetchAllData();
      setIsReviewModalOpen(false);
    } catch (error) {
      console.error("Error guardando revisión:", error);
      toast({ title: "Error al Guardar Revisión", description: (error as Error).message || "No se pudo guardar la revisión.", variant: "destructive" });
    } finally {
      setIsUpdatingReview(false);
    }
  };


  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Listado de Solicitudes">
        {canCreateRequest && (
          <Button asChild>
            <Link href="/requests/create">
              <Icons.add className="mr-2 h-4 w-4" />
              Crear Solicitud
            </Link>
          </Button>
        )}
      </PageHeader>

      <Card>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1" className="border-b-0">
             <CardHeader className="p-4">
                <AccordionTrigger className="flex w-full items-center justify-between p-0 hover:no-underline">
                  <CardTitle className="text-lg">Filtros</CardTitle>
                </AccordionTrigger>
              </CardHeader>
            <AccordionContent>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end pt-0 pb-4 px-4 md:px-6">
                <div>
                  <Label htmlFor="searchText">Buscar Solicitud</Label>
                  <Input
                    id="searchText"
                    placeholder="ID, Equipo ID, Descripción, Tipo Trabajo..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
                 <div>
                  <Label htmlFor="filterDateRange">Fecha de Solicitud</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button id="filterDateRange" variant={"outline"} className="w-full justify-start text-left font-normal">
                        <Icons.calendar className="mr-2 h-4 w-4" />
                        {filterDateRange?.from ? (
                          filterDateRange.to ? (
                            <>{format(filterDateRange.from, "LLL dd, y", { locale: es })} - {format(filterDateRange.to, "LLL dd, y", { locale: es })}</>
                          ) : (format(filterDateRange.from, "LLL dd, y", { locale: es }))
                        ) : (<span>Seleccionar rango</span>)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar initialFocus mode="range" defaultMonth={filterDateRange?.from} selected={filterDateRange} onSelect={setFilterDateRange} numberOfMonths={2} locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="filterTipoTrabajo">Tipo de Trabajo</Label>
                  <Select value={selectedTipoTrabajoId} onValueChange={(value) => setSelectedTipoTrabajoId(value === ALL_ITEMS_FILTER_VALUE ? "" : value)}>
                    <SelectTrigger id="filterTipoTrabajo"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ITEMS_FILTER_VALUE}>Todos los tipos</SelectItem>
                      {tiposTrabajoOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterCreadoPor">Creado Por</Label>
                  <Select
                    value={selectedCreadoPor === "" ? ALL_ITEMS_FILTER_VALUE : selectedCreadoPor}
                    onValueChange={(value) => {
                      setSelectedCreadoPor(value === ALL_ITEMS_FILTER_VALUE ? "" : value);
                    }}
                  >
                    <SelectTrigger id="filterCreadoPor">
                      <SelectValue placeholder="Seleccionar creador..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem key={ALL_ITEMS_FILTER_VALUE} value={ALL_ITEMS_FILTER_VALUE}>
                        Todos los usuarios
                      </SelectItem>
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterUrgencia">Urgencia</Label>
                  <Select value={selectedUrgencia} onValueChange={(value) => setSelectedUrgencia(value === ALL_ITEMS_FILTER_VALUE ? "" : value)}>
                    <SelectTrigger id="filterUrgencia"><SelectValue placeholder="Todas las urgencias" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ITEMS_FILTER_VALUE}>Todas las urgencias</SelectItem>
                      {URGENCIA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterEstado">Estado</Label>
                  <Select value={selectedEstado} onValueChange={(value) => setSelectedEstado(value === ALL_ITEMS_FILTER_VALUE ? "" : value)}>
                    <SelectTrigger id="filterEstado"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_ITEMS_FILTER_VALUE}>Todos los estados</SelectItem>
                      {ESTADO_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="xl:col-span-full xl:col-start-4 xl:self-end">
                  <Button onClick={handleClearFilters} variant="outline" className="w-full">
                    <Icons.filter className="mr-2 h-4 w-4" /> Limpiar Filtros
                  </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes Registradas ({filteredRequests.length})</CardTitle>
        </CardHeader>
        <CardContent>
           {isLoading && filteredRequests.length === 0 ? (
              <div className="flex items-center justify-center h-60">
                  <Icons.loader className="h-10 w-10 animate-spin text-primary" />
              </div>
          ) : (
          <ScrollArea className="h-[calc(100vh-380px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Solicitud</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Tipo Trabajo</TableHead>
                  <TableHead>Orden de Trabajo</TableHead>
                  <TableHead>Fecha Prog.</TableHead>
                  <TableHead>Creado Por</TableHead>
                  <TableHead>Urgencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((req) => {
                  const ordenInfo = solicitudToOrdenMap.get(req.id);
                  const estadoLabel = ESTADO_OPTIONS.find(opt => opt.value === req.estado)?.label || req.estado;
                  const tipoTrabajoNombre = getTipoTrabajoNombre(req.tipoTrabajo, req.equipoId);
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium text-xs" title={req.id}>
                        {req.displayId || req.id.substring(0,8) + "..."}
                      </TableCell>
                      <TableCell>{req.equipoId}</TableCell>
                      <TableCell>{tipoTrabajoNombre}</TableCell>
                      <TableCell>
                        {ordenInfo ? (
                          <Link href={`/work-orders/${ordenInfo.ordenId}`} className="text-primary hover:underline">
                            {ordenInfo.ordenDisplayId}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>{format(new Date(req.fechaProgramada), "dd/MM/yy")}</TableCell>
                      <TableCell>{getUserName(req.creadoPor)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(req.urgencia)} className={getStatusColorClass(req.urgencia)}>
                          {req.urgencia}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(req.estado)} className={getStatusColorClass(req.estado)}>
                          {estadoLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Icons.ellipsis className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUserCancelRequest(req) && (
                              <DropdownMenuItem
                                onClick={() => handleInitiateCancelRequest(req)}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                <Icons.xCircle className="mr-2 h-4 w-4" /> Cancelar Solicitud
                              </DropdownMenuItem>
                            )}
                             {canUserReviewRequest(req) && (
                              <DropdownMenuItem onClick={() => handleOpenReviewModal(req)}>
                                <Icons.edit className="mr-2 h-4 w-4" /> Revisar/Comentar
                              </DropdownMenuItem>
                            )}
                            {(!canUserCancelRequest(req) && !canUserReviewRequest(req)) && (
                               <DropdownMenuItem disabled>
                                <span className="text-muted-foreground">No hay acciones</span>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && filteredRequests.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                            {requests.length === 0 ? "No hay solicitudes registradas." : "No hay solicitudes que coincidan con los filtros."}
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isCancelConfirmOpen} onOpenChange={setIsCancelConfirmOpen}>
        <AlertDialogContentComponent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Cancelación de Solicitud</AlertDialogTitle>
            <AlertDialogDescription>
              Solicitud: {requestToCancel?.displayId || requestToCancel?.id} para equipo {requestToCancel?.equipoId}.
              {requestToCancel?.estado === 'asignada' && (
                <span className="block mt-2">
                  Esta solicitud está asignada a una orden de trabajo. Al cancelarla, el trabajo asociado también se marcará como cancelado.
                </span>
              )}
            </AlertDialogDescription>
            {requestToCancel?.estado === 'asignada' && (
              <div className="pt-2">
                <Label htmlFor="cancelationReason" className="text-sm font-medium">Motivo de Cancelación (Requerido)</Label>
                <Textarea
                  id="cancelationReason"
                  value={cancelationReason}
                  onChange={(e) => setCancelationReason(e.target.value)}
                  placeholder="Escriba el motivo de la cancelación..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setIsCancelConfirmOpen(false); setRequestToCancel(null); setCancelationReason("");}} >No, mantener</AlertDialogCancel>
            <AlertDialogAction 
                onClick={handleConfirmCancelRequest} 
                className={buttonVariants({variant: "destructive"})}
                disabled={isLoading || (requestToCancel?.estado === 'asignada' && cancelationReason.trim() === "")}
            >
              {isLoading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin"/> : null}
              Sí, cancelar solicitud
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContentComponent>
      </AlertDialog>

      <Dialog open={isReviewModalOpen} onOpenChange={(open) => { if (!open) setAssociatedTrabajo(null); setIsReviewModalOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeaderComponent>
            <DialogTitleComponent>Revisar Solicitud: {requestToReview?.displayId || requestToReview?.id}</DialogTitleComponent>
            <DialogDescriptionComponent>
              Revise los detalles del trabajo y añada sus observaciones.
            </DialogDescriptionComponent>
          </DialogHeaderComponent>
          {requestToReview && (
            <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4 py-4">
              <p className="text-sm"><strong>Equipo:</strong> {requestToReview.equipoId}</p>
              <p className="text-sm"><strong>Tipo Trabajo:</strong> {getTipoTrabajoNombre(requestToReview.tipoTrabajo, requestToReview.equipoId)}</p>
              {requestToReview.tiempoServicioEstimado !== undefined && <p className="text-sm"><strong>Tiempo Estimado:</strong> {requestToReview.tiempoServicioEstimado} min</p>}

              {associatedTrabajo && (
                <Card className="bg-muted/50">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="text-base">Detalles del Trabajo Asociado</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <p><strong>Completado por:</strong> {associatedTrabajo.completadoPor ? getUserName(associatedTrabajo.completadoPor) : "N/A"}</p>
                    <p><strong>Fecha Finalización (Técnico):</strong> {associatedTrabajo.fechaFinalizacion ? format(new Date(associatedTrabajo.fechaFinalizacion), "dd/MM/yyyy HH:mm") : "N/A"}</p>
                    <p><strong>Detalles (Técnico):</strong> {associatedTrabajo.detalles || "No especificado"}</p>
                    <p><strong>Hallazgos (Técnico):</strong> {associatedTrabajo.hallazgos || "No especificado"}</p>
                    <div className="text-sm flex items-center">
                      <strong className="mr-1">Estado Actual Trabajo:</strong>
                      <Badge variant={getStatusVariant(associatedTrabajo.estado as Solicitud["estado"])} className={getStatusColorClass(associatedTrabajo.estado as Solicitud["estado"])}>
                        {ESTADO_OPTIONS.find(opt => opt.value === associatedTrabajo.estado)?.label || associatedTrabajo.estado}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div>
                <Label htmlFor="reviewObservation">Observaciones del Ingeniero</Label>
                <Textarea
                  id="reviewObservation"
                  value={reviewObservation}
                  onChange={(e) => setReviewObservation(e.target.value)}
                  placeholder="Añada sus comentarios u observaciones sobre el trabajo realizado..."
                  rows={4}
                  disabled={isUpdatingReview}
                />
              </div>
              <div>
                <Label htmlFor="newReviewStatus">Nuevo Estado para la Solicitud</Label>
                <Select
                  value={newReviewStatus}
                  onValueChange={(val) => setNewReviewStatus(val as Solicitud["estado"])}
                  disabled={isUpdatingReview}
                >
                  <SelectTrigger id="newReviewStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOLICITUD_REVIEW_STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            </ScrollArea>
          )}
          <DialogFooterComponent> 
            <Button variant="outline" onClick={() => { setIsReviewModalOpen(false); setAssociatedTrabajo(null); }} disabled={isUpdatingReview}>Cancelar</Button>
            <Button onClick={handleConfirmReview} disabled={isUpdatingReview}>
              {isUpdatingReview ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.save className="mr-2 h-4 w-4" />}
              Guardar Revisión
            </Button>
          </DialogFooterComponent>
        </DialogContent>
      </Dialog>

    </div>
  );
}
