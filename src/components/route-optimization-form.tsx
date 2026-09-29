
"use client";

import type React from "react";
import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { optimizeRoute } from "@/ai/flows/route-optimization";
import type { OptimizeRouteInput, OptimizeRouteOutput } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icons } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";

const FormSchema = z.object({
  teamSkills: z.string().min(1, "Se requieren habilidades del equipo."),
  equipmentLocation: z.string().min(1, "Se requiere ubicación del equipo."),
  trafficConditions: z.string().min(1, "Se requieren condiciones de tráfico."),
  pendingRequests: z.string().min(1, "Se requieren solicitudes pendientes."),
});

type FormValues = z.infer<typeof FormSchema>;

export function RouteOptimizationForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizeRouteOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      teamSkills: "",
      equipmentLocation: "",
      trafficConditions: "Normal",
      pendingRequests: "",
    },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setIsLoading(true);
    setOptimizationResult(null);

    const input: OptimizeRouteInput = {
      teamSkills: data.teamSkills.split(",").map(s => s.trim()).filter(s => s),
      equipmentLocation: data.equipmentLocation,
      trafficConditions: data.trafficConditions,
      pendingRequests: data.pendingRequests.split(",").map(r => r.trim()).filter(r => r),
    };

    try {
      const result = await optimizeRoute(input);
      setOptimizationResult(result);
      toast({
        title: "Ruta Optimizada",
        description: "La ruta ha sido calculada exitosamente.",
      });
    } catch (error) {
      console.error("Error optimizing route:", error);
      toast({
        title: "Error de Optimización",
        description: "No se pudo optimizar la ruta. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Optimización de Ruta Asistida por IA</CardTitle>
        <CardDescription>
          Ingrese los detalles para obtener una sugerencia de ruta optimizada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="teamSkills"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Habilidades del Equipo (separadas por coma)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Ej: Electricista, Escalador, Conductor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="equipmentLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ubicación Actual del Equipamiento Principal</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Bodega Central, Norte" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="trafficConditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condiciones de Tráfico</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar condición" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Ligero">Ligero</SelectItem>
                      <SelectItem value="Normal">Normal</SelectItem>
                      <SelectItem value="Pesado">Pesado</SelectItem>
                      <SelectItem value="Congestionado">Congestionado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pendingRequests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IDs de Solicitudes Pendientes (separadas por coma)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Ej: S20240701-1, S20240702-5" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.route className="mr-2 h-4 w-4" />
              )}
              Optimizar Ruta
            </Button>
          </form>
        </Form>

        {optimizationResult && (
          <div className="mt-8 p-4 border rounded-md bg-muted/50">
            <h4 className="text-lg font-semibold mb-2">Resultado de Optimización:</h4>
            <p><strong>Ruta Optimizada:</strong> {optimizationResult.optimizedRoute.join(" -> ")}</p>
            <p><strong>Tiempo Estimado de Viaje:</strong> {optimizationResult.estimatedTravelTime}</p>
            <p><strong>Asignación de Recursos Sugerida:</strong> {optimizationResult.resourceAllocation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
