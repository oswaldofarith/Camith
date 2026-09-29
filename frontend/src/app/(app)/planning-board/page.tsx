import { Map, Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Provisional hasta la fase 4 (mapa MapLibre + optimización de rutas con OR-Tools). */
export default function TableroPlanificacionPage() {
  return (
    <>
      <PageHeader title="Tablero de planificación" />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <Map className="text-muted-foreground size-12" />
          <div className="max-w-md space-y-1">
            <h2 className="text-lg font-semibold">En preparación</h2>
            <p className="text-muted-foreground text-sm">
              El tablero con mapa y la asignación automática de rutas llegan en la siguiente fase. Mientras tanto
              puedes armar las órdenes manualmente.
            </p>
          </div>
          <Button asChild>
            <Link href="/work-orders/create"><Plus /> Crear orden manualmente</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
