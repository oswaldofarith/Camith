
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import Image from "next/image"; // Import next/image
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icons } from "@/components/icons";
import type { Vehiculo, UserProfile } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getVehiculos, addVehiculo, updateVehiculo, deleteVehiculo } from "@/services/vehicleService";
import { getUsers } from "@/services/userService"; // Import getUsers

const vehicleTypeOptions: { value: Vehiculo["tipo"]; label: string }[] = [
  { value: "camionetaCabinaSimple", label: "Camioneta Cabina Simple" },
  { value: "camionetaCabinaDoble", label: "Camioneta Cabina Doble" },
  { value: "camionCanasta", label: "Camión Canasta" },
];

const vehicleStateOptions: { value: Vehiculo["estado"]; label: string }[] = [
  { value: "disponible", label: "Disponible" },
  { value: "enMantenimiento", label: "En Mantenimiento" },
  { value: "dadoDeBaja", label: "Dado de Baja" },
];

const NO_CUSTODIAN_VALUE = "__NO_CUSTODIAN__";

interface VehicleFormProps {
  vehicle: Vehiculo | null; // The vehicle being edited, or null if creating
  allUsers: UserProfile[]; // All users for custodian selection
  allVehicles: Vehiculo[]; // All existing vehicles for checking custodian assignments
  isLoadingUsers: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const VehicleForm = ({ vehicle, allUsers, allVehicles, isLoadingUsers, onClose, onSuccess }: VehicleFormProps) => {
  const [id, setId] = useState(vehicle?.id || "");
  const [placa, setPlaca] = useState(vehicle?.placa || "");
  const [tipo, setTipo] = useState<Vehiculo["tipo"]>(vehicle?.tipo || "camionetaCabinaSimple");
  const [estado, setEstado] = useState<Vehiculo["estado"]>(vehicle?.estado || "disponible");
  const [selectedCustodioId, setSelectedCustodioId] = useState<string>(vehicle?.custodioId || NO_CUSTODIAN_VALUE);
  
  const [availableCustodians, setAvailableCustodians] = useState<UserProfile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setId(vehicle?.id || "");
    setPlaca(vehicle?.placa || "");
    setTipo(vehicle?.tipo || "camionetaCabinaSimple");
    setEstado(vehicle?.estado || "disponible");
    setSelectedCustodioId(vehicle?.custodioId || NO_CUSTODIAN_VALUE);
  }, [vehicle]);

  useEffect(() => {
    if (isLoadingUsers) {
        setAvailableCustodians([]);
        return;
    }

    const licensedUsers = allUsers.filter(user => {
        if (!user.habilidades || user.habilidades.length === 0) return false;
        if (tipo === "camionCanasta") return user.habilidades.includes("Conductor tipo D");
        return user.habilidades.includes("Conductor tipo C") || user.habilidades.includes("Conductor tipo D");
    });

    const assignedCustodianIds = new Set<string>();
    allVehicles.forEach(v => {
        if (vehicle && v.id === vehicle.id) return;
        if (v.custodioId) assignedCustodianIds.add(v.custodioId);
    });

    const finalAvailable = licensedUsers.filter(user => {
        return !assignedCustodianIds.has(user.id) || (vehicle?.custodioId === user.id);
    });

    setAvailableCustodians(finalAvailable);

  }, [tipo, allUsers, allVehicles, vehicle, isLoadingUsers]);


  useEffect(() => {
    if (selectedCustodioId !== NO_CUSTODIAN_VALUE && !availableCustodians.some(c => c.id === selectedCustodioId)) {
        setSelectedCustodioId(NO_CUSTODIAN_VALUE);
    }
  }, [availableCustodians, selectedCustodioId]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !placa.trim()) { 
      toast({ title: "Error de Validación", description: "Nº Unidad y Placa son requeridos.", variant: "destructive"});
      return;
    }
    setIsSubmitting(true);

    const vehicleData: Partial<Omit<Vehiculo, 'id'>> = {
      placa: placa.trim().toUpperCase(),
      tipo,
      estado,
      custodioId: selectedCustodioId === NO_CUSTODIAN_VALUE ? undefined : selectedCustodioId,
    };

    try {
      if (vehicle) {
        await updateVehiculo(vehicle.id, vehicleData);
        toast({ title: "Vehículo Actualizado", description: `El vehículo ${vehicle.id} ha sido actualizado.` });
      } else {
        const newVehicleWithId: Vehiculo = {
          id: id.trim().toUpperCase(),
          ...vehicleData,
        } as Vehiculo;
        await addVehiculo(newVehicleWithId);
        toast({ title: "Vehículo Agregado", description: `El vehículo ${newVehicleWithId.id} ha sido agregado.` });
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("VehicleForm: Error saving vehicle:", error);
      let description = "No se pudo guardar el vehículo.";
      if (error.code) {
        switch (error.code) {
          case 'permission-denied': description = "Permiso denegado por Firestore."; break;
          case 'already-exists': description = `El vehículo con Nº Unidad '${id}' ya existe.`; break;
          case 'invalid-argument': description = `Error de Firestore: ${error.message}.`; break;
          default: description = `Error de Firebase: ${error.message || 'Desconocido'} (Código: ${error.code})`;
        }
      } else if (error.message) {
        description = error.message;
      }
      toast({ title: "Error al Guardar", description, variant: "destructive", duration: 7000});
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{vehicle ? "Editar Vehículo" : "Agregar Vehículo"}</DialogTitle>
        <DialogDescription>
          {vehicle ? "Modifica los detalles del vehículo." : "Ingresa los detalles del nuevo vehículo."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="numeroUnidad" className="text-right">Nº Unidad</Label>
          <Input id="numeroUnidad" value={id} onChange={e => setId(e.target.value.toUpperCase())} className="col-span-3" placeholder="Ej: G-001" disabled={!!vehicle || isSubmitting} />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="placa" className="text-right">Placa</Label>
          <Input id="placa" value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} className="col-span-3" placeholder="Ej: GBC-1234" disabled={isSubmitting} />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="tipo" className="text-right">Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as Vehiculo["tipo"])} disabled={isSubmitting}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              {vehicleTypeOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="custodio" className="text-right">Custodio</Label>
          <Select 
            value={selectedCustodioId} 
            onValueChange={setSelectedCustodioId}
            disabled={isLoadingUsers || isSubmitting}
          >
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder={isLoadingUsers ? "Cargando..." : "Seleccionar custodio"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CUSTODIAN_VALUE}>Ningún Custodio</SelectItem>
              {availableCustodians.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.nombre} ({user.habilidades?.includes("Conductor tipo D") ? "D" : user.habilidades?.includes("Conductor tipo C") ? "C" : "Sin Lic."})
                </SelectItem>
              ))}
              {availableCustodians.length === 0 && !isLoadingUsers && <SelectItem value={NO_CUSTODIAN_VALUE} disabled>No hay custodios válidos para este tipo</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="estado" className="text-right">Estado</Label>
          <Select value={estado} onValueChange={(v) => setEstado(v as Vehiculo["estado"])} disabled={isSubmitting}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Seleccionar estado" />
            </SelectTrigger>
            <SelectContent>
              {vehicleStateOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
};


export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehiculo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehiculo | null>(null);
  const [isChangeStateModalOpen, setIsChangeStateModalOpen] = useState(false);
  const [vehicleToChangeState, setVehicleToChangeState] = useState<Vehiculo | null>(null);
  const [newState, setNewState] = useState<Vehiculo["estado"] | "">("");
  const { toast } = useToast();
  const [refreshCounter, setRefreshCounter] = useState(0);

  const getVehicleImagePath = (type: Vehiculo["tipo"]): string => {
    switch (type) {
      case "camionetaCabinaSimple":
        return "/images/camionetaCabinaSimple.webp";
      case "camionetaCabinaDoble":
        return "/images/camionetaCabinaDoble.webp";
      case "camionCanasta":
        return "/images/camionCanasta.webp";
      default:
        // Fallback image if new types are added without specific images
        return "/images/camionetaCabinaSimple.webp"; 
    }
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    setIsLoadingUsers(true);

    try {
      const vehicleList = await getVehiculos();
      setVehicles(vehicleList);
    } catch (error) {
      console.error("VehiclesPage: Error fetching vehicles:", error);
      toast({
        title: "Error al Cargar Vehículos",
        description: "No se pudieron obtener los datos de Firestore. Verifique la consola.",
        variant: "destructive",
      });
      setVehicles([]);
    } finally {
      setIsLoading(false);
    }

    try {
      const userList = await getUsers();
      setAllUsers(userList);
    } catch (error) {
      console.error("VehiclesPage: Error fetching users:", error);
      toast({
        title: "Error al Cargar Usuarios",
        description: "No se pudieron obtener los datos de usuarios para la selección de custodios.",
        variant: "destructive",
      });
      setAllUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  };


  useEffect(() => {
    fetchInitialData();
  }, [refreshCounter, toast]);

  const handleOperationSuccess = () => {
    setRefreshCounter(prev => prev + 1);
  };

  const handleCreateVehicle = () => {
    setEditingVehicle(null);
    setIsModalOpen(true);
  };

  const handleEditVehicle = (vehicle: Vehiculo) => {
    setEditingVehicle(vehicle);
    setIsModalOpen(true);
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (window.confirm(`¿Está seguro de eliminar el vehículo ${vehicleId}? Esta acción no se puede deshacer.`)) {
      try {
        await deleteVehiculo(vehicleId);
        toast({ title: "Vehículo Eliminado", description: `El vehículo ${vehicleId} ha sido eliminado.` });
        handleOperationSuccess();
      } catch (error) {
        console.error("Error deleting vehicle:", error);
        toast({ title: "Error al Eliminar", description: (error as Error).message || "No se pudo eliminar el vehículo.", variant: "destructive" });
      }
    }
  };

  const openChangeStateModal = (vehicle: Vehiculo) => {
    setVehicleToChangeState(vehicle);
    setNewState(vehicle.estado);
    setIsChangeStateModalOpen(true);
  };

  const handleChangeVehicleState = async () => {
    if (!vehicleToChangeState || !newState) {
      toast({ title: "Error", description: "Vehículo o nuevo estado no seleccionado.", variant: "destructive" });
      return;
    }
    try {
      await updateVehiculo(vehicleToChangeState.id, { estado: newState as Vehiculo["estado"] });
      toast({ title: "Estado Actualizado", description: `El estado del vehículo ${vehicleToChangeState.id} ha sido actualizado.` });
      handleOperationSuccess();
      setIsChangeStateModalOpen(false);
      setVehicleToChangeState(null);
    } catch (error) {
      console.error("Error changing vehicle state:", error);
      toast({ title: "Error al Cambiar Estado", description: (error as Error).message || "No se pudo actualizar el estado del vehículo.", variant: "destructive" });
    }
  };

  const getStatusVariant = (status: Vehiculo["estado"]): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "disponible": return "default";
      case "enMantenimiento": return "destructive";
      case "dadoDeBaja": return "secondary";
      default: return "outline";
    }
  };

  const getStatusColorClass = (status: Vehiculo["estado"]): string => {
    switch (status) {
      case "disponible": return "bg-green-500 text-white";
      case "enMantenimiento": return "bg-yellow-400 text-yellow-900 hover:bg-yellow-500";
      case "dadoDeBaja": return "bg-red-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };
  
  const getVehicleTypeDisplay = (type: Vehiculo["tipo"]) => {
    const foundType = vehicleTypeOptions.find(t => t.value === type);
    return foundType ? foundType.label : type;
  }

  const getCustodianName = (custodioId?: string) => {
    if (!custodioId) return <span className="text-muted-foreground">N/A</span>;
    if (isLoadingUsers) return <span className="text-xs text-muted-foreground">Cargando...</span>;
    const user = allUsers.find(u => u.id === custodioId);
    return user ? user.nombre : <span className="text-red-500 text-xs">ID: {custodioId} (No encontrado)</span>;
  };


  if (isLoading && vehicles.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Gestión de Vehículos" />
        <div className="flex items-center justify-center h-64">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Gestión de Vehículos">
        <Button onClick={handleCreateVehicle}>
          <Icons.add className="mr-2 h-4 w-4" /> Agregar Vehículo
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Imagen</TableHead>
                <TableHead>Nº Unidad</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Custodio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((vehicle) => {
                const imageSrc = getVehicleImagePath(vehicle.tipo);
                return (
                  <TableRow key={vehicle.id}>
                    <TableCell>
                      <Image
                        src={imageSrc}
                        alt={`Imagen de ${getVehicleTypeDisplay(vehicle.tipo)}`}
                        width={80}
                        height={50}
                        className="rounded-md object-cover"
                        unoptimized={imageSrc.startsWith('/')} // Important for local images if not using a loader
                      />
                    </TableCell>
                    <TableCell className="font-medium">{vehicle.id}</TableCell>
                    <TableCell>{vehicle.placa}</TableCell>
                    <TableCell>{getVehicleTypeDisplay(vehicle.tipo)}</TableCell>
                    <TableCell>{getCustodianName(vehicle.custodioId)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(vehicle.estado)} className={getStatusColorClass(vehicle.estado)}>
                        {vehicleStateOptions.find(s => s.value === vehicle.estado)?.label || vehicle.estado}
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
                          <DropdownMenuItem onClick={() => handleEditVehicle(vehicle)}>
                            <Icons.edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openChangeStateModal(vehicle)}>
                            <Icons.wrench className="mr-2 h-4 w-4" /> Cambiar Estado
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDeleteVehicle(vehicle.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            <Icons.delete className="mr-2 h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {vehicles.length === 0 && !isLoading && (
                <TableRow>
                    <TableCell colSpan={7} className="text-center h-24">
                        No hay vehículos registrados.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[525px]">
          {isModalOpen && <VehicleForm vehicle={editingVehicle} allUsers={allUsers} allVehicles={vehicles} isLoadingUsers={isLoadingUsers} onClose={() => setIsModalOpen(false)} onSuccess={handleOperationSuccess}/>}
        </DialogContent>
      </Dialog>

      <Dialog open={isChangeStateModalOpen} onOpenChange={setIsChangeStateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar Estado de Vehículo: {vehicleToChangeState?.id}</DialogTitle>
            <DialogDescription>Seleccione el nuevo estado para el vehículo {vehicleToChangeState?.placa}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Select value={newState || ""} onValueChange={(v) => setNewState(v as Vehiculo["estado"])}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar nuevo estado" />
              </SelectTrigger>
              <SelectContent>
                {vehicleStateOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {setIsChangeStateModalOpen(false); setVehicleToChangeState(null)}}>Cancelar</Button>
            <Button onClick={handleChangeVehicleState}>Guardar Estado</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
    
    