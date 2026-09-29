import type { BadgeProps } from "@/components/ui/badge";

/** Etiquetas y colores de los estados de solicitudes, órdenes y trabajos. */
export const ESTADO_SOLICITUD: Record<string, { etiqueta: string; variante: BadgeProps["variant"] }> = {
  pendiente: { etiqueta: "Pendiente", variante: "secondary" },
  asignada: { etiqueta: "Asignada", variante: "default" },
  completada: { etiqueta: "Completada", variante: "outline" },
  no_completada: { etiqueta: "No completada", variante: "destructive" },
  cancelada: { etiqueta: "Cancelada", variante: "outline" },
};

export const ESTADO_ORDEN: Record<string, { etiqueta: string; variante: BadgeProps["variant"] }> = {
  Pendiente: { etiqueta: "Pendiente", variante: "secondary" },
  "En Progreso": { etiqueta: "En progreso", variante: "default" },
  CompletadaParcial: { etiqueta: "Completada parcial", variante: "outline" },
  CompletadaTotal: { etiqueta: "Completada", variante: "outline" },
  Cancelada: { etiqueta: "Cancelada", variante: "destructive" },
};

export const ESTADO_TRABAJO: Record<string, { etiqueta: string; variante: BadgeProps["variant"]; color: string }> = {
  Pendiente: { etiqueta: "Pendiente", variante: "secondary", color: "var(--estado-pendiente)" },
  Completado: { etiqueta: "Completado", variante: "default", color: "var(--estado-completado)" },
  "No Completado": { etiqueta: "No completado", variante: "destructive", color: "var(--estado-no-completado)" },
  Cancelado: { etiqueta: "Cancelado", variante: "outline", color: "var(--estado-cancelado)" },
};

/** Colores de las series categóricas, en orden fijo (nunca cíclico). */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--serie-${i + 1})`);
