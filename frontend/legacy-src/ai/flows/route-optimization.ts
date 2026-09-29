'use server';
/**
 * @fileOverview A route optimization AI agent.
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { 
    OptimizeRouteInputSchema, 
    OptimizeRouteOutputSchema, 
    type OptimizeRouteInput, 
    type OptimizeRouteOutput 
} from '@/types';

const ai = genkit({
  plugins: [googleAI()],
});

const optimizeRouteFlow = ai.defineFlow(
  {
    name: 'optimizeRouteFlow',
    inputSchema: OptimizeRouteInputSchema,
    outputSchema: OptimizeRouteOutputSchema,
  },
  async (input) => {
    const prompt = `Eres un experto optimizador de rutas. Genera una ruta optimizada considerando:
      Skills: ${JSON.stringify(input.teamSkills)}
      Ubicación Equipo: ${input.equipmentLocation}
      Tráfico: ${input.trafficConditions}
      Solicitudes: ${JSON.stringify(input.pendingRequests)}`;
      
    const llmResponse = await ai.generate({
      prompt: prompt,
      model: googleAI.model('gemini-3-flash-preview'),
      output: { format: 'json', schema: OptimizeRouteOutputSchema },
    });

    const output = llmResponse.output;
    if (!output) throw new Error('AI failed to generate an optimized route.');
    return output;
  }
);

export async function optimizeRoute(input: OptimizeRouteInput): Promise<OptimizeRouteOutput> {
  return optimizeRouteFlow(input);
}
