
"use client";

import type React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { ArrowRight, ActivitySquare } from "lucide-react"; // Added ActivitySquare

const reportTypes = [
  {
    title: "Estadísticas por Usuario",
    description: "Trabajos completados y no completados por técnico.",
    href: "/reports/user-stats",
    icon: Icons.users,
  },
  {
    title: "Ranking de Equipos por Intervenciones",
    description: "Equipos con mayor número de intervenciones (basado en trabajos finalizados).",
    href: "/reports/equipment-ranking",
    icon: Icons.equipment,
  },
  {
    title: "Resumen Mensual de Solicitudes",
    description: "Comparativa de solicitudes creadas vs. trabajos exitosos por mes.",
    href: "/reports/monthly-request-summary", // Updated href
    icon: Icons.calendar,
  },
  {
    title: "Resumen de Órdenes de Trabajo",
    description: "Visión general de las órdenes creadas y su estado.",
    href: "/reports/work-order-summary",
    icon: Icons.workOrders,
  },
  {
    title: "Productividad Mensual por Tipo de Trabajo",
    description: "Conteos mensuales de trabajos completados, desglosados por tipo.",
    href: "/reports/monthly-productivity",
    icon: ActivitySquare, // Using ActivitySquare
  },
];

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Centro de Reportes" />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => (
          <Link href={report.href} key={report.href} legacyBehavior passHref>
            <Card className="flex flex-col hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader className="flex-row items-center gap-4 pb-4">
                <report.icon className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <CardDescription>{report.description}</CardDescription>
              </CardContent>
              <CardContent className="pt-0">
                <div className="flex items-center text-sm text-primary hover:underline">
                  Ver Reporte
                  <ArrowRight className="ml-1 h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
       <Card>
        <CardHeader>
          <CardTitle>Próximamente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Más reportes estarán disponibles en futuras actualizaciones, incluyendo análisis de tiempos, costos y rendimiento detallado de equipos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
