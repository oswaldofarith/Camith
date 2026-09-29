export const ESTADO_PLAN: Record<string, string> = {
  borrador: "Borrador",
  activo: "Activo",
  completado: "Completado",
  archivado: "Archivado",
};

export const ESTADO_MANTENIMIENTO: Record<string, string> = {
  programado: "Programado",
  solicitud_creada: "Solicitud creada",
  completado_ot: "Completado en OT",
};

export const CAMPOS_EXCLUSION = {
  tipo: "Tipo de equipo",
  marca: "Marca",
  zona: "Zona",
  zonaPeligrosa: "Zona peligrosa",
} as const;
