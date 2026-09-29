
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from "@/contexts/AuthContext";
import { getMaintenancePlans, deleteMaintenancePlan } from "@/services/maintenanceService";
import type { PlanDeMantenimiento } from "@/types";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export default function MaintenancePlansListPage() {
  const [plans, setPlans] = useState<PlanDeMantenimiento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<PlanDeMantenimiento | null>(null);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const fetchedPlans = await getMaintenancePlans();
      setPlans(fetchedPlans);
    } catch (error) {
      toast({
        title: "Error al Cargar Planes",
        description: "No se pudieron obtener los planes de mantenimiento.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [toast]);

  const canManagePlans = userProfile?.perfiles.some(p => ["supervisor", "administrador"].includes(p));

  const handleDeleteRequest = (plan: PlanDeMantenimiento) => {
    setPlanToDelete(plan);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!planToDelete) return;
    try {
      await deleteMaintenancePlan(planToDelete.id);
      toast({
        title: "Plan Eliminado",
        description: `El plan "${planToDelete.nombre}" ha sido eliminado.`,
      });
      fetchPlans(); // Refresca la lista
    } catch (error) {
      toast({
        title: "Error al Eliminar",
        description: "No se pudo eliminar el plan de mantenimiento.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setPlanToDelete(null);
    }
  };

  const getStatusVariant = (status?: PlanDeMantenimiento['estado']) => {
    switch (status) {
      case 'activo': return 'default';
      case 'borrador': return 'secondary';
      case 'completado': return 'outline';
      case 'archivado': return 'destructive';
      default: return 'outline';
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Planes de Mantenimiento">
        {canManagePlans && (
          <Button asChild>
            <Link href="/maintenance/create">
              <Icons.add className="mr-2 h-4 w-4" /> Crear Nuevo Plan
            </Link>
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Planes Existentes</CardTitle>
          <CardDescription>
            Listado de todos los planes de mantenimiento preventivo, activos y archivados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre del Plan</TableHead>
                <TableHead>Fecha Creación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Equipos Programados</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Icons.loader className="mx-auto h-8 w-8 animate-spin text-primary" />
                    Cargando planes...
                  </TableCell>
                </TableRow>
              ) : plans.length > 0 ? (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">
                        <Link href={`/maintenance/${plan.id}`} className="text-primary hover:underline">
                            {plan.nombre}
                        </Link>
                    </TableCell>
                    <TableCell>{format(new Date(plan.fechaCreacion), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(plan.estado)}>{plan.estado}</Badge>
                    </TableCell>
                    <TableCell>{plan.calendario?.length || 0}</TableCell>
                    <TableCell className="text-right">
                       <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={!canManagePlans}>
                              <Icons.ellipsis className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                               <Link href={`/maintenance/${plan.id}`}>
                                <Icons.view className="mr-2 h-4 w-4" /> Ver Detalles
                               </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => handleDeleteRequest(plan)}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                             >
                              <Icons.delete className="mr-2 h-4 w-4" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No se encontraron planes de mantenimiento.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el plan de mantenimiento "{planToDelete?.nombre}". No se eliminarán las solicitudes de servicio que ya hayan sido creadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
