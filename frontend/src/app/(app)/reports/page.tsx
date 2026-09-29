import { BarChart3, ClipboardList, Medal, Users, Wrench } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const REPORTES = [
  {
    href: "/reports/solicitudes-mensual",
    titulo: "Resumen mensual de solicitudes",
    descripcion: "Solicitudes creadas frente a trabajos completados y porcentaje de éxito por mes.",
    icono: BarChart3,
  },
  {
    href: "/reports/productividad-mensual",
    titulo: "Productividad por tipo de trabajo",
    descripcion: "Trabajos completados cada mes, desglosados por tipo de trabajo.",
    icono: Wrench,
  },
  {
    href: "/reports/ranking-equipos",
    titulo: "Ranking de equipos por intervenciones",
    descripcion: "Equipos que más visitas requirieron en el periodo.",
    icono: Medal,
  },
  {
    href: "/reports/tecnicos",
    titulo: "Estadísticas por técnico",
    descripcion: "Trabajos atendidos, completados y efectividad de cada técnico.",
    icono: Users,
  },
  {
    href: "/work-orders",
    titulo: "Resumen de órdenes de trabajo",
    descripcion: "Listado de órdenes filtrable por fecha, estado y técnico.",
    icono: ClipboardList,
  },
];

export default function ReportesPage() {
  return (
    <>
      <PageHeader title="Reportes" description="Indicadores calculados en el servidor sobre toda la información." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTES.map((r) => (
          <Link key={r.href} href={r.href} className="group">
            <Card className="group-hover:border-primary h-full transition-colors">
              <CardHeader>
                <r.icono className="text-primary mb-2 size-6" />
                <CardTitle className="text-lg">{r.titulo}</CardTitle>
                <CardDescription>{r.descripcion}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
