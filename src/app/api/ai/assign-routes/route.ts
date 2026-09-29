
import { NextResponse } from 'next/server';
import { assignRoutes } from '@/ai/flows/route-assignment';
import type { AssignRoutesAIInput } from '@/types';

export async function POST(request: Request) {
  try {
    const body: AssignRoutesAIInput = await request.json();

    console.log("[API /ai/assign-routes] Received payload for AI processing.");

    // Basic validation could go here, but Zod in the flow will handle it.
    if (!body.solicitudesPendientes || !body.unidadesDisponibles || !body.equipos || !body.sedeCentral) {
        return NextResponse.json({ error: "Faltan datos en la solicitud para la IA (solicitudes, unidades, equipos, sede)." }, { status: 400 });
    }
    
    console.log("[API /ai/assign-routes] Executing AI assignRoutes flow...");
    const aiResponse = await assignRoutes(body);
    console.log("[API /ai/assign-routes] AI Flow executed successfully.");

    return NextResponse.json(aiResponse);

  } catch (error: any) {
    console.error("[API /ai/assign-routes] Error executing assign routes flow:", error);
    const message = error.message || "Ocurrió un error al generar la asignación de rutas.";
    return NextResponse.json({ error: "Error en el servidor de IA.", details: message }, { status: 500 });
  }
}
