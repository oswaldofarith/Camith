
import { z } from 'zod';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export type UserSkill = "Eléctrico" | "Telecomunicaciones" | "Escalador" | "Conductor tipo C" | "Conductor tipo D";

export interface EstadoHistorialEntry {
  estado: "activo" | "inactivo";
  fecha: Date;
  modificadoPor: string; 
  motivo: string;
}

export interface UserProfile {
  id: string;
  nombre: string;
  email: string;
  cedula: string;
  fotoUrl?: string;
  estado: "activo" | "inactivo";
  estadoHistorial?: EstadoHistorialEntry[];
  habilidades?: UserSkill[];
  perfiles: ("administrador" | "supervisor" | "ingenieroDeOficina" | "tecnicoDeCampo")[];
  numeroRol?: string;
}

export interface Vehiculo {
  id: string; 
  placa: string;
  tipo: "camionetaCabinaSimple" | "camionetaCabinaDoble" | "camionCanasta" | string;
  estado: "disponible" | "enMantenimiento" | "dadoDeBaja" | string;
  custodioId?: string;
}

export interface EstadoHistorialEntryEquipo {
  estado: string;
  fecha: Date;
  modificadoPor: string;
  motivo?: string;
}

export interface Equipo {
  id: string;
  tipo: "Colector" | "Repetidor" | "Medidor" | string;
  direccion: string;
  ip?: string;
  tipoComunicacion: "Fibra óptica" | "Celular";
  piloto?: string;
  coordenadas: GeoPoint;
  marca: "Honeywell" | "Itron" | "Trilliant" | string;
  zona: "Norte" | "Centro" | "Sur" | "Vía a la Costa" | "Perimetral" | string;
  fechaFabricacion?: Date;
  fechaUltimaRevision: Date | null;
  revisionCount: number;
  requiereCanasta?: boolean;
  zonaPeligrosa?: boolean;
  estado: "Activo" | "Dado de baja" | string;
  estadoHistorial?: EstadoHistorialEntryEquipo[];
  proximoMantenimientoProgramado?: Date | null;
  intervaloMantenimientoDias?: number | null;
  intervaloMantenimientoRevisiones?: number | null;
  camposAdicionales?: Record<string, string | number | boolean | Date | null>;
}

export interface Solicitud {
  id: string;
  displayId?: string;
  equipoId: string;
  fechaSolicitud: Date;
  fechaProgramada: Date;
  tipoTrabajo: string;
  tiempoServicioEstimado?: number;
  urgencia: "Urgente" | "Normal" | string;
  descripcion?: string;
  creadoPor: string;
  estado: "pendiente" | "asignada" | "cancelada" | "completada" | "no_completada";
  motivoCancelacion?: string;
}

export interface UnidadDeCampo {
  id: string;
  vehiculoId: string;
  tecnicos: string[];
}

export interface Trabajo {
  id: string;
  equipoId: string;
  solicitudId: string;
  tipoTrabajo: string;
  tiempoServicioEstimado?: number;
  estado: "Pendiente" | "Completado" | "No Completado" | "Cancelado";
  detalles?: string;
  hallazgos?: string;
  fotos?: string[];
  completadoPor?: string;
  fechaFinalizacion?: Date;
  observacionIngeniero?: string;
  observacionIngenieroPor?: string;
  fechaObservacionIngeniero?: Date;
  requiereNuevaRevision?: boolean;
  fechaNuevaRevision?: Date;
  motivoCancelacion?: string;
}

export interface UnidadAsignadaOT {
  rutaId: string;
  vehiculoId: string;
  tecnicos: string[];
}

export interface OrdenDeTrabajo {
  id: string;
  displayId: string;
  fechaCreacion: Date;
  creadoPor: string;
  unidadesAsignadas: UnidadAsignadaOT[];
  trabajos: Trabajo[];
  estadoGeneral?: "Pendiente" | "En Progreso" | "CompletadaParcial" | "CompletadaTotal" | "Cancelada";
  allAssignedTechnicianIds?: string[];
}

export interface KpiData {
  ordenesDelDia: number;
  trabajosPendientes: number;
  trabajosCompletadosHoy: number;
}

export const EquipoForAISchema = z.object({
  id: z.string(),
  tipo: z.string(),
  fechaFabricacion: z.string().datetime().optional().nullable(),
  fechaUltimaRevision: z.string().datetime().optional().nullable(),
  revisionCount: z.number(),
  requiereCanasta: z.boolean().optional(),
  zonaPeligrosa: z.boolean().optional(),
  estado: z.string(),
  marca: z.string(),
  zona: z.string(),
});

export const CriterioExclusionSchema = z.object({
  campo: z.enum(['tipo', 'marca', 'zona', 'zonaPeligrosa']),
  operador: z.enum(['es', 'no_es']),
  valor: z.union([z.string(), z.boolean()]),
});

export const MaintenancePlanInputSchema = z.object({
  equipos: z.array(EquipoForAISchema),
  tiempoDeEjecucionDias: z.number().positive(),
  exclusiones: z.array(CriterioExclusionSchema),
});
export type MaintenancePlanInput = z.infer<typeof MaintenancePlanInputSchema>;

export const MantenimientoProgramadoSchema = z.object({
  equipoId: z.string(),
  fechaProgramada: z.string().datetime(),
  motivoPrioridad: z.string(),
});

export const MaintenancePlanOutputSchema = z.object({
  totalEquiposConsiderados: z.number().int(),
  totalEquiposExcluidos: z.number().int(),
  calendario: z.array(MantenimientoProgramadoSchema),
});
export type MaintenancePlanOutput = z.infer<typeof MaintenancePlanOutputSchema>;

export const OptimizeRouteInputSchema = z.object({
  teamSkills: z.array(z.string()),
  equipmentLocation: z.string(),
  trafficConditions: z.string(),
  pendingRequests: z.array(z.string()),
});
export type OptimizeRouteInput = z.infer<typeof OptimizeRouteInputSchema>;

export const OptimizeRouteOutputSchema = z.object({
  optimizedRoute: z.array(z.string()),
  estimatedTravelTime: z.string(),
  resourceAllocation: z.string(),
});
export type OptimizeRouteOutput = z.infer<typeof OptimizeRouteOutputSchema>;

export interface AppSettingOption {
  value: string;
  label: string;
}

export interface Localidad {
  id: string;
  nombre: string;
  coordenadas: GeoPoint;
}

export interface TipoTrabajoDetallado {
  id: string;
  nombre: string;
  tiempoEstimadoMinutos: number;
}

export interface TipoEquipoConTrabajos extends AppSettingOption {
  tiposDeTrabajoAsociados: TipoTrabajoDetallado[];
}

export interface AppSettingsState {
  empresaNombre?: string;
  empresaUnidadNegocio?: string;
  empresaDepartamento?: string;
  sedeCentralNombre?: string;
  sedeCentralLatitud?: number;
  sedeCentralLongitud?: number;
  localidades?: Localidad[];
  operatingHoursStart?: string;
  operatingHoursEnd?: string;
  planningTimeMinutes?: number;
  reportingTimeMinutes?: number;
  lunchTimeMinutes?: number;
  lunchStartTime?: string;
  lunchEndTime?: string;
  timezone?: string;
  marcasEquipos: AppSettingOption[];
  zonasEquipos: AppSettingOption[];
  tiposEquipos: TipoEquipoConTrabajos[];
  estadosEquipos: AppSettingOption[];
  tiposVehiculos: AppSettingOption[];
  estadosVehiculos: AppSettingOption[];
  urgenciasSolicitudes: AppSettingOption[];
  respuestasPredefinidasSolicitudes: AppSettingOption[];
}

export interface Notificacion {
  id: string;
  userId: string;
  mensaje: string;
  fechaCreacion: Date;
  leida: boolean;
  tipo?: "nueva_solicitud" | "solicitud_asignada" | "nueva_ot" | "trabajo_completado" | "trabajo_no_completado" | "trabajo_revisado" | "solicitud_cancelada" | "info_general";
  entidadId?: string;
  entidadUrl?: string;
  creadaPor?: string;
  creadaPorNombre?: string;
}

export interface CriterioExclusion {
  campo: 'tipo' | 'marca' | 'zona' | 'zonaPeligrosa';
  operador: 'es' | 'no_es';
  valor: string | boolean;
}

export interface MantenimientoProgramado {
  equipoId: string;
  fechaProgramada: Date;
  solicitudId?: string;
  estado: 'programado' | 'solicitud_creada' | 'completado_ot';
  motivoPrioridad: string;
}

export interface PlanDeMantenimiento {
  id: string;
  nombre: string;
  fechaCreacion: Date;
  creadoPor: string;
  tiempoDeEjecucionDias: number;
  exclusiones: CriterioExclusion[];
  calendario: MantenimientoProgramado[];
  estado: 'borrador' | 'activo' | 'completado' | 'archivado';
  estadisticas?: {
    totalEquiposConsiderados: number;
    totalEquiposExcluidos: number;
    totalMantenimientosProgramados: number;
  }
}

export const AssignRoutesEquipoSchema = z.object({
  id: z.string(),
  coordenadas: z.object({ latitude: z.number(), longitude: z.number() }),
  requiereCanasta: z.boolean().optional(),
  zonaPeligrosa: z.boolean().optional(),
});

export const AssignRoutesTecnicoSchema = z.object({
  id: z.string(),
  habilidades: z.array(z.string()).optional(),
});

export const AssignRoutesUnidadSchema = z.object({
  id: z.string(),
  tipoVehiculo: z.string(),
  tecnicos: z.array(AssignRoutesTecnicoSchema),
});

export const AssignRoutesSolicitudSchema = z.object({
  id: z.string(),
  equipoId: z.string(),
  urgencia: z.string(),
  tiempoServicioEstimado: z.number().optional(),
});

export const AIInputRutaExistenteSchema = z.object({
  nombreRuta: z.string(),
  solicitudesAsignadas: z.array(AssignRoutesSolicitudSchema),
  unidadesAsignadas: z.array(AssignRoutesUnidadSchema),
});

export const AssignRoutesAIInputSchema = z.object({
  sedeCentral: z.object({ lat: z.number(), lon: z.number() }),
  solicitudesPendientes: z.array(AssignRoutesSolicitudSchema),
  equipos: z.array(AssignRoutesEquipoSchema),
  unidadesDisponibles: z.array(AssignRoutesUnidadSchema),
  rutasExistentes: z.array(AIInputRutaExistenteSchema).optional(),
  operatingHoursStart: z.string(),
  operatingHoursEnd: z.string(),
  planningTimeMinutes: z.number().int(),
  lunchTimeMinutes: z.number().int(),
  reportingTimeMinutes: z.number().int(),
  maxNewRoutes: z.number().int().optional(),
});
export type AssignRoutesAIInput = z.infer<typeof AssignRoutesAIInputSchema>;

export const AssignRoutesAIResultSchema = z.object({
  nombreRuta: z.string(),
  solicitudesAsignadas: z.array(z.string()),
  unidadesAsignadas: z.array(z.string()),
});

export const AssignRoutesAIOutputSchema = z.object({
  rutas: z.array(AssignRoutesAIResultSchema),
});
export type AssignRoutesAIOutput = z.infer<typeof AssignRoutesAIOutputSchema>;
