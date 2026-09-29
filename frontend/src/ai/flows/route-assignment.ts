'use server';
/**
 * @fileOverview An AI agent for intelligent route assignment.
 *
 * - assignRoutes - A function that handles the route assignment process.
 * - AssignRoutesAIInput - The input type for the assignRoutes function.
 * - AssignRoutesAIOutput - The return type for the assignRoutes function.
 */

import { genkit } from 'genkit';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/google-genai';
import {
  AssignRoutesAIInputSchema,
  AssignRoutesAIOutputSchema,
  type AssignRoutesAIInput,
  type AssignRoutesAIOutput,
} from '@/types';

// Instantiate Genkit locally
const ai = genkit({
  plugins: [googleAI()],
});

const getOptimizedRouteAndTravelTime = ai.defineTool(
  {
    name: 'getOptimizedRouteAndTravelTime',
    description: 'Para un conjunto de trabajos, calcula la ruta de viaje más eficiente y la duración total en minutos. Devuelve el orden optimizado de los trabajos y el tiempo total de viaje.',
    inputSchema: z.object({
      origin: z.object({ lat: z.number(), lon: z.number() }).describe("Punto de partida, ej: la sede central."),
      destination: z.object({ lat: z.number(), lon: z.number() }).describe("Punto final para el regreso, ej: la sede central."),
      jobLocations: z.array(z.object({
        id: z.string(),
        location: z.object({ lat: z.number(), lon: z.number() })
      })).describe("Lista de trabajos a realizar. Cada uno con su ID de solicitud y ubicación."),
    }),
    outputSchema: z.object({
      totalTravelMinutes: z.number().describe("Duración total del viaje para la ruta optimizada, en minutos."),
      optimizedJobOrder: z.array(z.string()).describe("Lista de los IDs de las solicitudes en el orden de viaje optimizado."),
    }),
  },
  async (input) => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key is not configured.");
      return { totalTravelMinutes: -1, optimizedJobOrder: [] };
    }
    const originStr = `${input.origin.lat},${input.origin.lon}`;
    const destinationStr = `${input.destination.lat},${input.destination.lon}`;
    
    if (input.jobLocations.length === 0) {
        const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&key=${apiKey}`);
        const data = await response.json();
        if (data.status === 'OK' && data.routes.length > 0) {
            const leg = data.routes[0].legs[0];
            return { totalTravelMinutes: Math.ceil(leg.duration.value / 60), optimizedJobOrder: [] };
        }
        return { totalTravelMinutes: 0, optimizedJobOrder: [] };
    }

    const waypointsStr = input.jobLocations.map(job => `${job.location.lat},${job.location.lon}`).join('|');
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&waypoints=optimize:true|${waypointsStr}&key=${apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.routes.length > 0) {
        const route = data.routes[0];
        let totalDuration = 0;
        route.legs.forEach(leg => {
          totalDuration += leg.duration.value;
        });
        const optimizedJobOrder = route.waypoint_order.map(index => input.jobLocations[index].id);
        return { totalTravelMinutes: Math.ceil(totalDuration / 60), optimizedJobOrder };
      } else {
        console.warn(`Directions API failed for route optimization: ${data.status}`, data.error_message || '');
        return { totalTravelMinutes: -1, optimizedJobOrder: input.jobLocations.map(j => j.id) };
      }
    } catch (error) {
      console.error("Error fetching optimized route from Google Maps API:", error);
      return { totalTravelMinutes: -1, optimizedJobOrder: input.jobLocations.map(j => j.id) };
    }
  }
);

const systemPrompt = `
Eres un experto en logística y despacho para una empresa eléctrica. Tu tarea es completar un plan de trabajo diario asignando todas las solicitudes pendientes a las rutas disponibles.

## Objetivo y Restricciones
1. **Carga de Trabajo Equilibrada**: Distribuye las solicitudes entre las rutas disponibles (existentes y nuevas). Equilibra el número de trabajos y la suma de tiempos de servicio.
2. **Respetar Asignaciones Manuales**: NO elimines solicitudes o unidades de las rutas preexistentes. Solo añade nuevas.
3. **Reglas de Asignación**:
    - Un trabajo urgente DEBE ser el primero en su ruta. Evita dos urgentes en la misma ruta.
    - Equipos que requieren canasta DEBEN ir en rutas con un vehículo 'camionCanasta'.
    - Un camión canasta NUNCA debe ir solo; requiere otra unidad de acompañante en la misma ruta.
4. **Límite de Jornada**: Considera el tiempo de servicio + viaje aproximado dentro de las horas laborales.

## Procedimiento
1. Agrupa las solicitudes por ruta basándote en las reglas.
2. Llama a la herramienta 'getOptimizedRouteAndTravelTime' UNA VEZ para cada ruta final para obtener el orden y tiempo óptimo.
`;

const assignRoutesFlow = ai.defineFlow(
  {
    name: 'assignRoutesFlow',
    inputSchema: AssignRoutesAIInputSchema,
    outputSchema: AssignRoutesAIOutputSchema,
  },
  async (input) => {
    const llmResponse = await ai.generate({
      model: googleAI.model('gemini-3-flash-preview'),
      tools: [getOptimizedRouteAndTravelTime],
      system: systemPrompt,
      prompt: `Planifica las rutas para hoy usando estos datos: ${JSON.stringify(input)}`,
      output: { format: 'json', schema: AssignRoutesAIOutputSchema },
    });

    const output = llmResponse.output;
    if (!output) throw new Error('AI failed to generate a valid route assignment plan.');
    return output;
  }
);

export async function assignRoutes(input: AssignRoutesAIInput): Promise<AssignRoutesAIOutput> {
  return assignRoutesFlow(input);
}
