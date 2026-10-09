"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import Link from "next/link";

import { Cargando, ErrorCarga, Vacio } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";

import { ESTADO_PLAN } from "./estados";

export default function PlanesPage() {
  const planes = useQuery({
    queryKey: ["planes"],
    queryFn: () => unwrap(api.GET("/api/planes-mantenimiento")),
  });

  return (
    <>
      <PageHeader title="Planes de mantenimiento" description="Calendarios de mantenimiento preventivo.">
        <Button asChild>
          <Link href="/maintenance/create"><Plus /> Nuevo plan</Link>
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          {planes.isPending ? (
            <Cargando />
          ) : planes.isError ? (
            <ErrorCarga error={planes.error} />
          ) : !planes.data.length ? (
            <Vacio texto="Aún no hay planes de mantenimiento." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="hidden sm:table-cell">Plazo</TableHead>
                  <TableHead className="hidden md:table-cell">Mantenimientos</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planes.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/maintenance/${p.id}`} className="text-primary hover:underline">{p.nombre}</Link>
                    </TableCell>
                    <TableCell>{format(new Date(p.fecha_creacion), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="hidden sm:table-cell">{p.tiempo_de_ejecucion_dias} días hábiles</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {String(p.estadisticas.totalMantenimientosProgramados ?? "—")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.estado === "activo" ? "default" : "outline"}>{ESTADO_PLAN[p.estado] ?? p.estado}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
