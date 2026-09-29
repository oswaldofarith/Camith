'use server';
/**
 * @fileOverview An AI agent for creating preventive maintenance plans.
 * This has been optimized to perform deterministic logic in code for performance and reliability,
 * removing the Genkit AI call to prevent timeouts.
 *
 * - planMaintenance - A function that generates a maintenance calendar.
 * - MaintenancePlanInput - The input type for the planMaintenance function.
 * - MaintenancePlanOutput - The return type for the planMaintenance function.
 */

import { genkit } from 'genkit';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/google-genai';
import {
  MaintenancePlanInputSchema,
  MaintenancePlanOutputSchema,
  type MaintenancePlanInput,
  type MaintenancePlanOutput,
} from '@/types';

// Instantiate Genkit to define the flow, although the AI call is now handled by code.
const ai = genkit({
  plugins: [googleAI()],
});

// Define the main flow
const planMaintenanceFlow = ai.defineFlow(
  {
    name: 'planMaintenanceFlow',
    inputSchema: MaintenancePlanInputSchema,
    outputSchema: MaintenancePlanOutputSchema,
  },
  async (input) => {
    console.log(`[planMaintenanceFlow] Starting... Received ${input.equipos.length} equipos.`);

    const { equipos, tiempoDeEjecucionDias, exclusiones } = input;

    // Step 1: Filter Equipment in TypeScript
    const equiposFiltrados = equipos.filter((eq) => {
      if (eq.estado !== 'Activo') {
        return false;
      }
      for (const exclusion of exclusiones) {
        const eqValue = eq[exclusion.campo as keyof typeof eq];
        if (exclusion.operador === 'es') {
          if (typeof eqValue === 'boolean' && typeof exclusion.valor === 'boolean') {
            if (eqValue === exclusion.valor) return false;
          } else if (String(eqValue).toLowerCase() === String(exclusion.valor).toLowerCase()) {
            return false;
          }
        }
      }
      return true;
    });

    const totalEquiposConsiderados = equiposFiltrados.length;
    const totalEquiposExcluidos = equipos.length - totalEquiposConsiderados;

    console.log(`[planMaintenanceFlow] Filtering complete. Equipos a considerar: ${totalEquiposConsiderados}, Equipos excluidos: ${totalEquiposExcluidos}`);

    if (totalEquiposConsiderados === 0) {
      console.log('[planMaintenanceFlow] No equipment to schedule. Returning empty plan.');
      return {
        totalEquiposConsiderados: 0,
        totalEquiposExcluidos: totalEquiposExcluidos,
        calendario: [],
      };
    }

    // Step 2: Prioritize Equipment in TypeScript
    const equiposPriorizados = [...equiposFiltrados].sort((a, b) => {
      const dateA = a.fechaUltimaRevision ? new Date(a.fechaUltimaRevision).getTime() : -Infinity;
      const dateB = b.fechaUltimaRevision ? new Date(b.fechaUltimaRevision).getTime() : -Infinity;
      if (dateA !== dateB) return dateA - dateB;

      const fabDateA = a.fechaFabricacion ? new Date(a.fechaFabricacion).getTime() : Infinity;
      const fabDateB = b.fechaFabricacion ? new Date(b.fechaFabricacion).getTime() : Infinity;
      if (fabDateA !== fabDateB) return fabDateA - fabDateB;

      return (b.revisionCount || 0) - (a.revisionCount || 0);
    });

    // Step 3: Schedule Maintenance in TypeScript, skipping weekends
    const calendario: MaintenancePlanOutput['calendario'] = [];
    const diasHabiles = tiempoDeEjecucionDias;
    const equiposPorDia = Math.ceil(equiposPriorizados.length / Math.max(1, diasHabiles));

    let fechaProgramada = new Date();
    fechaProgramada.setHours(9, 0, 0, 0);

    // If today is a weekend, start scheduling from the next Monday
    while (fechaProgramada.getDay() === 0 || fechaProgramada.getDay() === 6) {
        fechaProgramada.setDate(fechaProgramada.getDate() + 1);
    }
    
    equiposPriorizados.forEach((equipo, index) => {
        // If the daily quota is met, move to the next working day
        if (index > 0 && index % equiposPorDia === 0) {
            fechaProgramada.setDate(fechaProgramada.getDate() + 1);
            // Skip weekends
            while (fechaProgramada.getDay() === 0 || fechaProgramada.getDay() === 6) {
                fechaProgramada.setDate(fechaProgramada.getDate() + 1);
            }
        }
        
        // Assign the current scheduled date
        calendario.push({
            equipoId: equipo.id,
            fechaProgramada: new Date(fechaProgramada).toISOString(), // Use a copy of the date
            motivoPrioridad: 'Priorizado por reglas de negocio (Antigüedad, Revisiones).',
        });
    });


    // Step 4: Construct and return final plan
    const output: MaintenancePlanOutput = {
      totalEquiposConsiderados,
      totalEquiposExcluidos,
      calendario,
    };
    
    console.log(`[planMaintenanceFlow] Logic executed. Scheduled ${output.calendario.length} maintenances.`);
    return output;
  }
);

// The exported function that the client will call.
export async function planMaintenance(
  input: {
    equipos: any[];
    tiempoDeEjecucionDias: number;
    exclusiones: any[];
  }
): Promise<MaintenancePlanOutput> {
  // Sanitize the input to match the Zod schema (convert Dates to ISO strings)
  const sanitizedInput: MaintenancePlanInput = {
    ...input,
    equipos: input.equipos.map((eq) => ({
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
  };

  const result = await planMaintenanceFlow(sanitizedInput);

  return result;
}
