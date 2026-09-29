
"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { AppSettingsState, CriterioExclusion, PlanDeMantenimiento, Equipo } from "@/types";
import { getAppSettings } from "@/services/settingsService";
import { getEquipos } from "@/services/equipmentService";
import { addMaintenancePlan } from "@/services/maintenanceService";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export default function CreateMaintenancePlanPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data sources
  const [appSettings, setAppSettings] = useState<AppSettingsState | null>(null);
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);

  // Form state
  const [planName, setPlanName] = useState(`Plan de Mantenimiento ${new Date().getFullYear()}`);
  const [planDuration, setPlanDuration] = useState("365");
  const [exclusions, setExclusions] = useState<CriterioExclusion[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settings, equipos] = await Promise.all([
        getAppSettings(),
        getEquipos(),
      ]);
      setAppSettings(settings);
      setAllEquipos(equipos);
    } catch (error) {
      console.error("Error fetching data for maintenance plan creation:", error);
      toast({
        title: "Error al Cargar Datos",
        description: "No se pudieron obtener las configuraciones o la lista de equipos.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const handleExclusionChange = (campo: CriterioExclusion['campo'], valor: string, isChecked: boolean) => {
    setExclusions(prev => {
      const existingIndex = prev.findIndex(ex => ex.campo === campo && ex.valor === valor);
      if (isChecked) {
        if (existingIndex === -1) {
          // Add exclusion
          return [...prev, { campo, operador: 'es', valor }];
        }
        return prev; // Already exists
      } else {
        if (existingIndex > -1) {
          // Remove exclusion
          return prev.filter((_, index) => index !== existingIndex);
        }
        return prev;
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast({ title: "Error de Autenticación", description: "No se pudo identificar al usuario.", variant: "destructive" });
      return;
    }
    const durationDays = parseInt(planDuration, 10);
    if (!planName.trim() || isNaN(durationDays) || durationDays <= 0) {
      toast({ title: "Datos Inválidos", description: "El nombre y la duración (un número positivo) son requeridos.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    toast({ title: "Procesando Plan...", description: "La IA está analizando los equipos y generando el calendario. Esto puede tardar un momento." });

    try {
      // 1. Call the new API endpoint
      const apiResponse = await fetch('/api/maintenance/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          equipos: allEquipos.map(eq => ({ // Sanitize data for API
            id: eq.id,
            tipo: eq.tipo,
            estado: eq.estado,
            marca: eq.marca,
            zona: eq.zona,
            revisionCount: eq.revisionCount,
            requiereCanasta: eq.requiereCanasta,
            zonaPeligrosa: eq.zonaPeligrosa,
            fechaFabricacion: eq.fechaFabricacion ? new Date(eq.fechaFabricacion).toISOString() : null,
            fechaUltimaRevision: eq.fechaUltimaRevision ? new Date(eq.fechaUltimaRevision).toISOString() : null,
          })),
          tiempoDeEjecucionDias: durationDays,
          exclusiones: exclusions,
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.details || `Error del servidor: ${apiResponse.statusText}`);
      }

      const aiResponse = await apiResponse.json();

      if (!aiResponse || !aiResponse.calendario) {
        throw new Error("La IA no devolvió un calendario válido.");
      }
      
      toast({ title: "Calendario Generado", description: `Se programaron ${aiResponse.calendario.length} mantenimientos.`});

      // 2. Create the full plan object
      const newPlan: Omit<PlanDeMantenimiento, 'id'> = {
        nombre: planName.trim(),
        fechaCreacion: new Date(),
        creadoPor: currentUser.uid,
        tiempoDeEjecucionDias: durationDays,
        exclusiones: exclusions,
        calendario: aiResponse.calendario.map((c: any) => ({...c, fechaProgramada: new Date(c.fechaProgramada)})),
        estado: 'activo',
        estadisticas: {
            totalEquiposConsiderados: aiResponse.totalEquiposConsiderados,
            totalEquiposExcluidos: aiResponse.totalEquiposExcluidos,
            totalMantenimientosProgramados: aiResponse.calendario.length,
        }
      };

      // 3. Save to Firestore
      const newPlanId = await addMaintenancePlan(newPlan);
      
      toast({ title: "¡Plan Creado Exitosamente!", description: `El plan "${newPlan.nombre}" ha sido guardado.` });
      
      // 4. Redirect to the new plan's detail page
      router.push(`/maintenance/${newPlanId}`);

    } catch (error) {
      console.error("Error creating maintenance plan:", error);
      toast({
        title: "Error al Crear el Plan",
        description: (error instanceof Error) ? error.message : "Ocurrió un error inesperado al contactar la IA o guardar el plan.",
        variant: "destructive",
        duration: 8000,
      });
      setIsSubmitting(false);
    }
  };
  
  const renderExclusionSelector = (
    title: string,
    campo: CriterioExclusion['campo'],
    options: { value: string | boolean; label: string }[]
  ) => {
    const selectedValues = exclusions.filter(ex => ex.campo === campo).map(ex => ex.valor);
    const triggerLabel = selectedValues.length === 0 ? `Excluir por ${title}` : `${selectedValues.length} ${title} excl.`;

    return (
        <div>
            <Label className="text-xs">{title}</Label>
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                {triggerLabel}
                <Icons.chevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
                <DropdownMenuLabel>Excluir si {title} es...</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-60 overflow-y-auto">
                    {options.map((option) => (
                    <DropdownMenuCheckboxItem
                        key={String(option.value)}
                        checked={selectedValues.includes(option.value)}
                        onCheckedChange={(checked) => handleExclusionChange(campo, String(option.value), Boolean(checked))}
                    >
                        {option.label}
                    </DropdownMenuCheckboxItem>
                    ))}
                </div>
            </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
  };


  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Crear Nuevo Plan de Mantenimiento" />

      <form onSubmit={handleSubmit}>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Paso 1: Define el Plan</CardTitle>
                <CardDescription>Establece el nombre, duración y los criterios para excluir equipos del análisis.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="planName">Nombre del Plan</Label>
                  <Input
                    id="planName"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="planDuration">Duración del Plan (días)</Label>
                  <Input
                    id="planDuration"
                    type="number"
                    value={planDuration}
                    onChange={(e) => setPlanDuration(e.target.value)}
                    disabled={isSubmitting}
                    required
                    min="1"
                  />
                </div>
                <div>
                  <Label>Criterios de Exclusión</Label>
                  <div className="p-4 border rounded-md mt-2 grid grid-cols-2 gap-4">
                      {renderExclusionSelector('Tipo', 'tipo', appSettings?.tiposEquipos || [])}
                      {renderExclusionSelector('Marca', 'marca', appSettings?.marcasEquipos || [])}
                      {renderExclusionSelector('Zona', 'zona', appSettings?.zonasEquipos || [])}
                      {renderExclusionSelector('Zona Peligrosa', 'zonaPeligrosa', [{value: true, label: "Sí"}, {value: false, label: "No"}])}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-20">
                <CardHeader>
                    <CardTitle>Paso 2: Generar Calendario</CardTitle>
                    <CardDescription>Al hacer clic, la IA analizará los equipos, aplicará las exclusiones y prioridades para generar el calendario de mantenimiento.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-1 text-xs text-muted-foreground">
                        <p><strong>Total de Equipos a Analizar:</strong> {isLoading ? '...' : allEquipos.length}</p>
                        <p><strong>Prioridades:</strong></p>
                        <ol className="list-decimal list-inside pl-2">
                            <li>Equipos con más tiempo sin mantenimiento.</li>
                            <li>Equipos más antiguos (por fecha de fabricación).</li>
                            <li>Equipos con más revisiones registradas.</li>
                        </ol>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <Button type="submit" size="lg" className="w-full" disabled={isLoading || isSubmitting}>
                        {isSubmitting ? (
                            <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                           <Icons.activity className="mr-2 h-4 w-4" />
                        )}
                        Analizar y Crear Plan
                    </Button>
                     <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/maintenance')} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                </CardFooter>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
