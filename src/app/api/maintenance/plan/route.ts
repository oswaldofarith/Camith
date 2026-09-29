
import { NextResponse } from 'next/server';
import { planMaintenance } from '@/ai/flows/maintenancePlanner';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Basic validation
    if (!body.equipos || !body.tiempoDeEjecucionDias === undefined) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos: equipos y tiempoDeEjecucionDias son necesarios.' }, { status: 400 });
    }

    // The planMaintenance function expects a specific input type, which is now handled inside the flow file
    // We just pass the body directly, assuming it matches the expected structure.
    console.log("[API /maintenance/plan] Executing AI planMaintenance flow...");
    const aiResponse = await planMaintenance(body);
    console.log("[API /maintenance/plan] AI Flow executed successfully.");

    return NextResponse.json(aiResponse);

  } catch (error: any) {
    console.error("[API /maintenance/plan] Error executing maintenance plan flow:", error);
    // Sanitize error message for the client
    const message = error.message || "Ocurrió un error al generar el plan de mantenimiento.";
    return NextResponse.json({ error: "Error en el servidor de IA.", details: message }, { status: 500 });
  }
}
