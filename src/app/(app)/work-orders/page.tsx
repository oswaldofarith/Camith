
"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { OrdenDeTrabajo, UserProfile } from "@/types";
import { getWorkOrders } from "@/services/workOrderService";
import { getUsers } from "@/services/userService";
import { format, parseISO, isValid, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";

const ALL_ORDER_STATUSES: OrdenDeTrabajo["estadoGeneral"][] = [
  "Pendiente",
  "En Progreso",
  "CompletadaParcial",
  "CompletadaTotal",
  "Cancelada",
];

const DEFAULT_FILTER_STATUSES: OrdenDeTrabajo["estadoGeneral"][] = ["Pendiente", "En Progreso"];
const ALL_CREATORS_FILTER_VALUE = "_ALL_CREATORS_"; // Unique non-empty value for "All users" option

export default function WorkOrdersListPage() {
  const [allWorkOrders, setAllWorkOrders] = useState<OrdenDeTrabajo[]>([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<OrdenDeTrabajo[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // Filter states
  const [filterDisplayId, setFilterDisplayId] = useState("");
  const [filterCreatorId, setFilterCreatorId] = useState("");
  const [filterStatuses, setFilterStatuses] = useState<Array<OrdenDeTrabajo["estadoGeneral"]>>(DEFAULT_FILTER_STATUSES);
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

  const canCreateOrder = useMemo(() => {
    if (!userProfile) return false;
    return userProfile.perfiles.includes("administrador") || userProfile.perfiles.includes("supervisor");
  }, [userProfile]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [fetchedOrders, fetchedUsers] = await Promise.all([
          getWorkOrders(),
          getUsers()
        ]);
        setAllWorkOrders(fetchedOrders);
        setUsers(fetchedUsers);
      } catch (error) {
        console.error("Error fetching data for work orders list:", error);
        toast({
          title: "Error al Cargar Datos",
          description: "No se pudieron obtener las órdenes de trabajo o los usuarios.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  useEffect(() => {
    let tempFiltered = [...allWorkOrders];

    if (filterDisplayId) {
      tempFiltered = tempFiltered.filter(order =>
        order.displayId.toLowerCase().includes(filterDisplayId.toLowerCase())
      );
    }

    if (filterCreatorId) { // This check handles filterCreatorId === "" correctly
      tempFiltered = tempFiltered.filter(order => order.creadoPor === filterCreatorId);
    }

    if (filterStatuses.length > 0) {
      tempFiltered = tempFiltered.filter(order =>
        order.estadoGeneral && filterStatuses.includes(order.estadoGeneral)
      );
    }
    
    if (filterDateRange?.from) {
        const fromDate = startOfDay(filterDateRange.from);
        tempFiltered = tempFiltered.filter(order => {
            const orderDate = new Date(order.fechaCreacion);
            return orderDate >= fromDate;
        });
    }

    if (filterDateRange?.to) {
        const toDate = endOfDay(filterDateRange.to);
         tempFiltered = tempFiltered.filter(order => {
            const orderDate = new Date(order.fechaCreacion);
            return orderDate <= toDate;
        });
    }

    setFilteredWorkOrders(tempFiltered.sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()));
  }, [allWorkOrders, filterDisplayId, filterCreatorId, filterStatuses, filterDateRange]);


  const handleStatusChange = (status: OrdenDeTrabajo["estadoGeneral"]) => {
    setFilterStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleClearFilters = () => {
    setFilterDisplayId("");
    setFilterCreatorId("");
    setFilterStatuses(DEFAULT_FILTER_STATUSES);
    setFilterDateRange(undefined);
  };
  
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? user.nombre : userId;
  };

  const getStatusVariant = (status?: OrdenDeTrabajo["estadoGeneral"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "Pendiente": return "destructive";
      case "En Progreso": return "default"; 
      case "CompletadaTotal": return "default";
      case "CompletadaParcial": return "secondary";
      case "Cancelada": return "secondary";
      default: return "outline";
    }
  };
   const getStatusColorClass = (status?: OrdenDeTrabajo["estadoGeneral"]): string => {
    switch (status) {
      case "Pendiente": return "bg-yellow-400 text-yellow-900";
      case "En Progreso": return "bg-blue-500 text-white";
      case "CompletadaTotal": return "bg-green-500 text-white";
      case "CompletadaParcial": return "bg-teal-500 text-white";
      case "Cancelada": return "bg-slate-500 text-white";
      default: return "border";
    }
  };
  
  const statusDisplayMap: Record<NonNullable<OrdenDeTrabajo["estadoGeneral"]>, string> = {
    "Pendiente": "Pendiente",
    "En Progreso": "En Progreso",
    "CompletadaParcial": "Completada Parcial",
    "CompletadaTotal": "Completada Total",
    "Cancelada": "Cancelada",
  };


  if (isLoading && allWorkOrders.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Órdenes de Trabajo" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Órdenes de Trabajo">
        {canCreateOrder && (
          <Button asChild>
            <Link href="/work-orders/create">
              <Icons.createWorkOrder className="mr-2 h-4 w-4" />
              Crear Orden
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
                  <Label htmlFor="filterDisplayId">ID Orden</Label>
                  <Input
                    id="filterDisplayId"
                    placeholder="Buscar por ID..."
                    value={filterDisplayId}
                    onChange={(e) => setFilterDisplayId(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="filterCreatorId">Creado Por</Label>
                  <Select
                    value={filterCreatorId}
                    onValueChange={(value) => {
                      setFilterCreatorId(value === ALL_CREATORS_FILTER_VALUE ? "" : value);
                    }}
                  >
                    <SelectTrigger id="filterCreatorId">
                      <SelectValue placeholder="Todos los usuarios" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_CREATORS_FILTER_VALUE}>Todos los usuarios</SelectItem>
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>{user.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estado General</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {filterStatuses.length === 0
                          ? "Todos los estados"
                          : filterStatuses.length === 1
                          ? statusDisplayMap[filterStatuses[0] as NonNullable<OrdenDeTrabajo["estadoGeneral"]>]
                          : `${filterStatuses.length} estados seleccionados`}
                        <Icons.chevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      <DropdownMenuLabel>Seleccionar Estados</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setFilterStatuses([])}>
                        Todos los estados
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {ALL_ORDER_STATUSES.map((status) => (
                        <DropdownMenuCheckboxItem
                          key={status}
                          checked={filterStatuses.includes(status)}
                          onCheckedChange={() => status && handleStatusChange(status)}
                        >
                          {statusDisplayMap[status as NonNullable<OrdenDeTrabajo["estadoGeneral"]>]}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div>
                  <Label htmlFor="filterDateRange">Fecha de Creación</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="filterDateRange"
                        variant={"outline"}
                        className="w-full justify-start text-left font-normal"
                      >
                        <Icons.calendar className="mr-2 h-4 w-4" />
                        {filterDateRange?.from ? (
                          filterDateRange.to ? (
                            <>
                              {format(filterDateRange.from, "LLL dd, y", { locale: es })} -{" "}
                              {format(filterDateRange.to, "LLL dd, y", { locale: es })}
                            </>
                          ) : (
                            format(filterDateRange.from, "LLL dd, y", { locale: es })
                          )
                        ) : (
                          <span>Seleccionar rango</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={filterDateRange?.from}
                        selected={filterDateRange}
                        onSelect={setFilterDateRange}
                        numberOfMonths={2}
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="xl:col-start-4">
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
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Orden</TableHead>
                <TableHead>Fecha Creación</TableHead>
                <TableHead>Creado Por</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead># Trabajos</TableHead>
                <TableHead>Unidades Asignadas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && filteredWorkOrders.length === 0 && (
                 <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                         <Icons.loader className="mx-auto h-8 w-8 animate-spin text-primary" />
                         Cargando órdenes...
                    </TableCell>
                 </TableRow>
              )}
              {!isLoading && filteredWorkOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.displayId}</TableCell>
                  <TableCell>{format(new Date(order.fechaCreacion), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell>{getUserName(order.creadoPor)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(order.estadoGeneral)} className={getStatusColorClass(order.estadoGeneral)}>
                      {statusDisplayMap[order.estadoGeneral as NonNullable<OrdenDeTrabajo["estadoGeneral"]>] || order.estadoGeneral || "No definido"}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.trabajos?.length || 0}</TableCell>
                  <TableCell>
                    {order.unidadesAsignadas && order.unidadesAsignadas.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {order.unidadesAsignadas.map(ua => (
                                <Badge key={ua.vehiculoId + ua.rutaId} variant="secondary" className="text-xs">
                                    {ua.vehiculoId}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/work-orders/${order.id}`}>
                        <Icons.view className="mr-2 h-3.5 w-3.5" />
                        Ver Detalles
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && filteredWorkOrders.length === 0 && allWorkOrders.length > 0 && (
                 <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                        No hay órdenes de trabajo que coincidan con los filtros aplicados.
                    </TableCell>
                </TableRow>
              )}
               {!isLoading && allWorkOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No hay órdenes de trabajo registradas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
