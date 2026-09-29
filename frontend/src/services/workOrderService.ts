

import { db } from '@/lib/firebase/firebase';
import type { OrdenDeTrabajo, Trabajo, UserProfile, Notificacion, Solicitud } from '@/types'; 
import {
  collection,
  doc,
  writeBatch,
  Timestamp,
  getDocs,
  query,
  orderBy,
  getDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getUsers } from './userService'; 
import { createNotificationsForUsers, createNotification } from './notificationService'; 

const ORDENES_DE_TRABAJO_COLLECTION = 'ordenesDeTrabajo';
const SOLICITUDES_COLLECTION = 'solicitudes'; 

// Helper to convert Firestore Timestamps to Dates in an OrdenDeTrabajo object
const mapOrderDocumentToOrdenDeTrabajo = (docSnap: any): OrdenDeTrabajo => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    fechaCreacion: (data.fechaCreacion instanceof Timestamp) ? data.fechaCreacion.toDate() : new Date(),
    trabajos: data.trabajos?.map((trabajo: any) => ({
      ...trabajo,
      fechaFinalizacion: trabajo.fechaFinalizacion instanceof Timestamp ? trabajo.fechaFinalizacion.toDate() : null,
      fechaNuevaRevision: trabajo.fechaNuevaRevision instanceof Timestamp ? trabajo.fechaNuevaRevision.toDate() : undefined,
      fechaObservacionIngeniero: trabajo.fechaObservacionIngeniero instanceof Timestamp ? trabajo.fechaObservacionIngeniero.toDate() : undefined,
      tiempoServicioEstimado: trabajo.tiempoServicioEstimado === undefined ? undefined : trabajo.tiempoServicioEstimado, // Added
      fotos: trabajo.fotos || [],
    })) || [],
    allAssignedTechnicianIds: data.allAssignedTechnicianIds || [],
  } as OrdenDeTrabajo;
};

const determineOverallOrderStatus = (trabajos: Trabajo[]): OrdenDeTrabajo["estadoGeneral"] => {
  if (!trabajos || trabajos.length === 0) {
    return "Pendiente";
  }

  const totalTrabajos = trabajos.length;
  const completados = trabajos.filter(t => t.estado === "Completado").length;
  const noCompletados = trabajos.filter(t => t.estado === "No Completado").length;
  const cancelados = trabajos.filter(t => t.estado === "Cancelado").length;
  const pendientes = trabajos.filter(t => t.estado === "Pendiente").length;

  if (pendientes > 0) {
    if (completados > 0 || noCompletados > 0 || cancelados > 0) {
      return "En Progreso";
    }
    return "Pendiente";
  }
  
  if (cancelados === totalTrabajos && totalTrabajos > 0) {
      return "Cancelada"; 
  }
  if (completados === totalTrabajos && totalTrabajos > 0) {
    return "CompletadaTotal";
  }
  if ((completados > 0 || noCompletados > 0 || cancelados > 0) && totalTrabajos > 0) {
    return "CompletadaParcial"; 
  }
  
  return "Pendiente"; 
};


export const createWorkOrdersBatch = async (
  workOrdersData: Omit<OrdenDeTrabajo, 'id' | 'fechaCreacion' | 'displayId' | 'estadoGeneral' | 'allAssignedTechnicianIds'>[],
  userId: string 
): Promise<OrdenDeTrabajo[]> => {
  const batch = writeBatch(db);
  const createdOrders: OrdenDeTrabajo[] = [];
  const currentDate = new Date();
  let allUsers: UserProfile[] = []; 

  console.log(`[WOService:createBatch] START. Creator UserID: ${userId}. Num OTs to create: ${workOrdersData.length}`);

  try {
    allUsers = await getUsers();
  } catch (userError) {
    console.warn("[WOService:createBatch] WARNING: Could not fetch user profiles for detailed notifications:", userError);
  }
  
  const creatorOfWorkOrder = allUsers.find(u => u.id === userId);
  const creatorOfWorkOrderName = creatorOfWorkOrder?.nombre || userId;

  for (const [index, otData] of workOrdersData.entries()) {
    const newOrderRef = doc(collection(db, ORDENES_DE_TRABAJO_COLLECTION));
    const displayId = `OT-${currentDate.getFullYear()}${(currentDate.getMonth() + 1).toString().padStart(2, '0')}${currentDate.getDate().toString().padStart(2, '0')}-${index + 1}-${newOrderRef.id.substring(0,4).toUpperCase()}`;
    
    // Fetch solicitud details to get tiempoServicioEstimado
    const trabajosConTiempoEstimado: Trabajo[] = [];
    for (const [tIndex, trabajoData] of otData.trabajos.entries()) {
        let tiempoEstimado: number | undefined = undefined;
        if (trabajoData.solicitudId) {
            const solicitudDocRef = doc(db, SOLICITUDES_COLLECTION, trabajoData.solicitudId);
            const solicitudDocSnap = await getDoc(solicitudDocRef);
            if (solicitudDocSnap.exists()) {
                const solicitud = solicitudDocSnap.data() as Solicitud;
                tiempoEstimado = solicitud.tiempoServicioEstimado;
            }
        }
        trabajosConTiempoEstimado.push({
            ...trabajoData,
            id: `${displayId}-T${tIndex + 1}`,
            tiempoServicioEstimado: tiempoEstimado, // Asignar el tiempo estimado
            detalles: trabajoData.detalles || null,
            hallazgos: trabajoData.hallazgos || null,
            completadoPor: trabajoData.completadoPor || null,
            fechaFinalizacion: trabajoData.fechaFinalizacion || null,
            observacionIngeniero: trabajoData.observacionIngeniero || null,
            observacionIngenieroPor: null,
            fechaObservacionIngeniero: null,
            requiereNuevaRevision: trabajoData.requiereNuevaRevision || false,
            fechaNuevaRevision: trabajoData.fechaNuevaRevision || null,
            motivoCancelacion: trabajoData.motivoCancelacion || null,
        });
    }

    const uniqueTechnicianIds = Array.from(new Set(otData.unidadesAsignadas.flatMap(ua => ua.tecnicos)));
    const initialEstadoGeneral = determineOverallOrderStatus(trabajosConTiempoEstimado);

    const orderPayload: OrdenDeTrabajo = {
      ...otData,
      id: newOrderRef.id,
      displayId: displayId,
      fechaCreacion: currentDate,
      creadoPor: userId,
      estadoGeneral: initialEstadoGeneral,
      trabajos: trabajosConTiempoEstimado,
      allAssignedTechnicianIds: uniqueTechnicianIds,
    };

    const firestoreOrderPayload = {
        ...orderPayload,
        fechaCreacion: Timestamp.fromDate(orderPayload.fechaCreacion),
        trabajos: orderPayload.trabajos.map(t => {
            const trabajoWithTimestamps: any = {
              id: t.id,
              equipoId: t.equipoId,
              solicitudId: t.solicitudId ?? null,
              tipoTrabajo: t.tipoTrabajo,
              tiempoServicioEstimado: t.tiempoServicioEstimado ?? 0, // Guardar tiempo
              estado: t.estado,
              detalles: t.detalles ?? null,
              hallazgos: t.hallazgos ?? null,
              fotos: t.fotos ?? [],
              completadoPor: t.completadoPor ?? null,
              fechaFinalizacion: t.fechaFinalizacion instanceof Date ? Timestamp.fromDate(t.fechaFinalizacion) : null,
              observacionIngeniero: t.observacionIngeniero ?? null,
              observacionIngenieroPor: t.observacionIngenieroPor ?? null,
              fechaObservacionIngeniero: t.fechaObservacionIngeniero instanceof Date ? Timestamp.fromDate(t.fechaObservacionIngeniero) : null,
              requiereNuevaRevision: t.requiereNuevaRevision ?? false,
              fechaNuevaRevision: t.fechaNuevaRevision instanceof Date ? Timestamp.fromDate(t.fechaNuevaRevision) : null,
              motivoCancelacion: t.motivoCancelacion ?? null,
            };
            return trabajoWithTimestamps;
        })
    };

    batch.set(newOrderRef, firestoreOrderPayload);
    createdOrders.push(orderPayload);

    otData.trabajos.forEach((trabajo) => {
      if (trabajo.solicitudId) {
        const solicitudRef = doc(db, SOLICITUDES_COLLECTION, trabajo.solicitudId);
        batch.update(solicitudRef, { estado: 'asignada' });
      }
    });
  }

  try {
    await batch.commit();
    console.log(`[WOService:createBatch] Batch of ${createdOrders.length} OTs committed successfully.`);

    for (const order of createdOrders) {
      for (const trabajo of order.trabajos) {
        if (trabajo.solicitudId) {
          const solicitudRef = doc(db, SOLICITUDES_COLLECTION, trabajo.solicitudId);
          const solicitudDoc = await getDoc(solicitudRef);
          if (solicitudDoc.exists()) {
            const solicitudData = solicitudDoc.data();
            const creadorSolicitudId = solicitudData.creadoPor;
            
            if (creadorSolicitudId && creadorSolicitudId !== userId) {
              const mensajeNotificacion = `Tu solicitud ${solicitudData.displayId || trabajo.solicitudId} (Eq: ${trabajo.equipoId}) fue asignada a OT ${order.displayId} por ${creatorOfWorkOrderName}.`;
              await createNotification(
                creadorSolicitudId,
                mensajeNotificacion,
                "solicitud_asignada",
                trabajo.solicitudId,
                `/requests`, 
                userId,
                creatorOfWorkOrderName
              );
            }
          }
        }
      }
    }

    for (const order of createdOrders) {
      if (order.allAssignedTechnicianIds && order.allAssignedTechnicianIds.length > 0) {
        const techIdsToNotify = order.allAssignedTechnicianIds;
        await createNotificationsForUsers(
          techIdsToNotify,
          (recipientProfile, sourceUserProfile) => 
            `Se te ha asignado la Orden de Trabajo ${order.displayId} por ${sourceUserProfile?.nombre || order.creadoPor}. Revisa tus trabajos.`,
          "nueva_ot",        
          order.id,          
          `/technician/my-jobs`, 
          order.creadoPor,   
          allUsers           
        );
      }
    }
    return createdOrders;
  } catch (error) {
    console.error("[WOService:createBatch] Error committing batch or sending post-commit notifications: ", error);
    throw error;
  }
};


export const getWorkOrders = async (): Promise<OrdenDeTrabajo[]> => {
  try {
    const q = query(collection(db, ORDENES_DE_TRABAJO_COLLECTION), orderBy('fechaCreacion', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => mapOrderDocumentToOrdenDeTrabajo(docSnap));
  } catch (error) {
    console.error("[WOService:getWorkOrders] Error fetching work orders: ", error);
    throw error;
  }
};

export const getWorkOrderById = async (id: string): Promise<OrdenDeTrabajo | null> => {
  try {
    const docRef = doc(db, ORDENES_DE_TRABAJO_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapOrderDocumentToOrdenDeTrabajo(docSnap);
    }
    return null;
  } catch (error) {
    console.error(`[WOService:getWorkOrderById] Error fetching work order by ID (${id}): `, error);
    throw error;
  }
};

export const updateTrabajoInOrden = async (
  ordenId: string,
  trabajoId: string,
  updates: Partial<Omit<Trabajo, 'id' | 'solicitudId' | 'equipoId' | 'tipoTrabajo'>>,
  userId: string 
): Promise<void> => {
  const ordenDocRef = doc(db, ORDENES_DE_TRABAJO_COLLECTION, ordenId);
  let allUsers: UserProfile[] = [];
  try {
    allUsers = await getUsers();
  } catch (userError) {
    console.warn("[WOService:updateTrabajo] WARNING: Could not fetch user profiles for notifications:", userError);
  }

  try {
    const ordenSnap = await getDoc(ordenDocRef);
    if (!ordenSnap.exists()) throw new Error(`Orden de trabajo con ID ${ordenId} no encontrada.`);

    const ordenData = mapOrderDocumentToOrdenDeTrabajo(ordenSnap);
    const trabajoIndex = ordenData.trabajos.findIndex(t => t.id === trabajoId);
    if (trabajoIndex === -1) throw new Error(`Trabajo con ID ${trabajoId} no encontrado en la orden ${ordenId}.`);

    const originalTrabajo = { ...ordenData.trabajos[trabajoIndex] };
    const updatedTrabajo = { ...originalTrabajo, ...updates };

    if ((updates.estado === "Completado" || updates.estado === "No Completado") && originalTrabajo.estado === "Pendiente") {
      updatedTrabajo.fechaFinalizacion = new Date();
      updatedTrabajo.completadoPor = userId;
      if (updates.estado !== "Cancelado") updatedTrabajo.motivoCancelacion = undefined;
    } else if (updates.estado === "Pendiente") { 
      updatedTrabajo.fechaFinalizacion = undefined;
      updatedTrabajo.completadoPor = undefined;
      updatedTrabajo.motivoCancelacion = undefined;
      updatedTrabajo.observacionIngeniero = undefined;
      updatedTrabajo.observacionIngenieroPor = undefined;
      updatedTrabajo.fechaObservacionIngeniero = undefined;
    } else if (updates.estado === "Cancelado") {
      updatedTrabajo.fechaFinalizacion = new Date(); 
      updatedTrabajo.completadoPor = userId; 
      if(updates.observacionIngeniero !== undefined) { 
        updatedTrabajo.observacionIngeniero = undefined;
        updatedTrabajo.observacionIngenieroPor = undefined;
        updatedTrabajo.fechaObservacionIngeniero = undefined;
      }
    }

    if (updates.observacionIngeniero !== undefined) {
      if (updates.observacionIngeniero && updates.observacionIngeniero.trim() !== "") {
        updatedTrabajo.observacionIngeniero = updates.observacionIngeniero;
        updatedTrabajo.observacionIngenieroPor = userId;
        updatedTrabajo.fechaObservacionIngeniero = new Date();
      } else { 
        updatedTrabajo.observacionIngeniero = undefined;
        updatedTrabajo.observacionIngenieroPor = undefined;
        updatedTrabajo.fechaObservacionIngeniero = undefined;
      }
    }
    
    ordenData.trabajos[trabajoIndex] = updatedTrabajo;

    if (updatedTrabajo.solicitudId) {
      const solicitudRef = doc(db, SOLICITUDES_COLLECTION, updatedTrabajo.solicitudId.trim());
      let solicitudUpdatePayload: any = {};
      if (updatedTrabajo.estado === "Completado") solicitudUpdatePayload.estado = "completada";
      else if (updatedTrabajo.estado === "No Completado") solicitudUpdatePayload.estado = "no_completada";
      else if (updatedTrabajo.estado === "Cancelado") {
        solicitudUpdatePayload.estado = "cancelada";
        solicitudUpdatePayload.motivoCancelacion = updatedTrabajo.motivoCancelacion || "Cancelado desde OT";
      } else if (updatedTrabajo.estado === "Pendiente") {
        const currentSolicitudSnap = await getDoc(solicitudRef);
        if(currentSolicitudSnap.exists() && currentSolicitudSnap.data().estado !== 'pendiente') {
            solicitudUpdatePayload.estado = "asignada"; 
        }
      }
      if (Object.keys(solicitudUpdatePayload).length > 0) {
        await updateDoc(solicitudRef, solicitudUpdatePayload);
      }
    }

    const nuevoEstadoGeneral = determineOverallOrderStatus(ordenData.trabajos);
    
    const firestoreTrabajos = ordenData.trabajos.map(t => {
      return {
        id: t.id,
        equipoId: t.equipoId,
        solicitudId: t.solicitudId ?? null,
        tipoTrabajo: t.tipoTrabajo,
        tiempoServicioEstimado: t.tiempoServicioEstimado ?? 0, // Ensure it's saved
        estado: t.estado,
        detalles: t.detalles ?? null,
        hallazgos: t.hallazgos ?? null,
        fotos: t.fotos ?? [],
        completadoPor: t.completadoPor ?? null,
        fechaFinalizacion: t.fechaFinalizacion instanceof Date ? Timestamp.fromDate(t.fechaFinalizacion) : null,
        observacionIngeniero: t.observacionIngeniero ?? null,
        observacionIngenieroPor: t.observacionIngenieroPor ?? null,
        fechaObservacionIngeniero: t.fechaObservacionIngeniero instanceof Date ? Timestamp.fromDate(t.fechaObservacionIngeniero) : null,
        requiereNuevaRevision: t.requiereNuevaRevision ?? false,
        fechaNuevaRevision: t.fechaNuevaRevision instanceof Date ? Timestamp.fromDate(t.fechaNuevaRevision) : null,
        motivoCancelacion: t.motivoCancelacion ?? null,
      };
    });

    const updatePayloadForFirestore: Partial<OrdenDeTrabajo> = {
      trabajos: firestoreTrabajos,
      estadoGeneral: nuevoEstadoGeneral,
    };

    await updateDoc(ordenDocRef, updatePayloadForFirestore);

    // Notifications
    if (updatedTrabajo.solicitudId &&
        (updatedTrabajo.estado === "Completado" || updatedTrabajo.estado === "No Completado" || updatedTrabajo.estado === "Cancelado") &&
        originalTrabajo.estado !== updatedTrabajo.estado 
    ) {
      try {
        const solicitudDocRef = doc(db, SOLICITUDES_COLLECTION, updatedTrabajo.solicitudId);
        const solicitudSnap = await getDoc(solicitudDocRef);
        if (solicitudSnap.exists()) {
          const solicitudData = solicitudSnap.data() as Solicitud;
          const creadorSolicitudId = solicitudData.creadoPor;
          const creadorSolicitudProfile = allUsers.find(u => u.id === creadorSolicitudId);
          if (creadorSolicitudProfile && creadorSolicitudProfile.perfiles.includes("ingenieroDeOficina") && creadorSolicitudId !== userId) {
            const actualizadorDelTrabajo = allUsers.find(u => u.id === userId);
            const actualizadorNombre = actualizadorDelTrabajo?.nombre || `Usuario (${userId.substring(0,5)})`;
            const solicitudDisplayId = solicitudData.displayId || updatedTrabajo.solicitudId.substring(0,8);
            let notifMensaje = `El trabajo ${updatedTrabajo.id} (OT: ${ordenData.displayId}, Sol: ${solicitudDisplayId}, Eq: ${updatedTrabajo.equipoId}) `;
            let notifTipo: Notificacion['tipo'] = "info_general";
            if (updatedTrabajo.estado === "Completado") { notifMensaje += `ha sido marcado como COMPLETADO por ${actualizadorNombre}.`; notifTipo = "trabajo_completado";}
            else if (updatedTrabajo.estado === "No Completado") { notifMensaje += `ha sido marcado como NO COMPLETADO por ${actualizadorNombre}.`; notifTipo = "trabajo_no_completado";}
            else if (updatedTrabajo.estado === "Cancelado") { notifMensaje += `ha sido CANCELADO por ${actualizadorNombre}.${updatedTrabajo.motivoCancelacion ? ` Motivo: ${updatedTrabajo.motivoCancelacion}.` : ''}`; notifTipo = "trabajo_cancelado";}
            await createNotification(creadorSolicitudId, notifMensaje, notifTipo, ordenData.id, `/work-orders/${ordenData.id}`, userId, actualizadorNombre);
          }
        }
      } catch (solicitudError) {
        console.warn(`[WOService:updateTrabajo] Advertencia: No se pudo obtener la solicitud ${updatedTrabajo.solicitudId} para notificación al ingeniero:`, solicitudError);
      }
    }

    let notificationSentForThisUpdate = false;
    const supervisorName = allUsers.find(u => u.id === userId)?.nombre || `Usuario (${userId.substring(0,5)})`;
    if (ordenData.allAssignedTechnicianIds && ordenData.allAssignedTechnicianIds.length > 0 && allUsers.length > 0) {
      const techniciansToNotify = ordenData.allAssignedTechnicianIds.filter(techId => techId !== userId);
      if (techniciansToNotify.length > 0) {
        let mensajeNotificacion = ""; let tipoNotificacion: Notificacion['tipo'] = "info_general"; const trabajoUrl = `/work-orders/${ordenData.id}`; 
        if (updatedTrabajo.estado === "Cancelado" && originalTrabajo.estado !== "Cancelado") {
          mensajeNotificacion = `El trabajo ${originalTrabajo.id} (OT: ${ordenData.displayId}) fue CANCELADO por ${supervisorName}. ${updatedTrabajo.motivoCancelacion ? `Motivo: ${updatedTrabajo.motivoCancelacion}` : ''}`; tipoNotificacion = "trabajo_cancelado"; notificationSentForThisUpdate = true;
        } else if ( ((updatedTrabajo.estado === "No Completado" && originalTrabajo.estado === "Completado") || (updatedTrabajo.estado === "Completado" && originalTrabajo.estado === "No Completado")) && originalTrabajo.completadoPor && originalTrabajo.completadoPor !== userId ) {
          mensajeNotificacion = `El estado del trabajo ${originalTrabajo.id} (OT: ${ordenData.displayId}) fue cambiado a '${updatedTrabajo.estado}' por ${supervisorName}. ${updatedTrabajo.observacionIngeniero ? 'Revisa las observaciones.' : ''}`; tipoNotificacion = "trabajo_revisado"; notificationSentForThisUpdate = true;
        } else if ( (updatedTrabajo.estado === "Completado" || updatedTrabajo.estado === "No Completado") && originalTrabajo.estado === "Pendiente" && updatedTrabajo.completadoPor === userId ) {
          mensajeNotificacion = `El trabajo ${originalTrabajo.id} (OT: ${ordenData.displayId}) fue marcado como '${updatedTrabajo.estado}' por ${supervisorName}.`; tipoNotificacion = updatedTrabajo.estado === "Completado" ? "trabajo_completado" : "trabajo_no_completado"; notificationSentForThisUpdate = true;
        } else if ( !notificationSentForThisUpdate && updates.observacionIngeniero !== undefined && updates.observacionIngeniero !== originalTrabajo.observacionIngeniero && (originalTrabajo.estado === "Completado" || originalTrabajo.estado === "No Completado") ) {
          mensajeNotificacion = `${supervisorName} actualizó observaciones para el trabajo ${originalTrabajo.id} (OT: ${ordenData.displayId}). Estado actual: ${updatedTrabajo.estado}.`; tipoNotificacion = "trabajo_revisado";
        }
        if (mensajeNotificacion && tipoNotificacion !== "info_general") {
          await createNotificationsForUsers(techniciansToNotify, () => mensajeNotificacion, tipoNotificacion, ordenData.id, trabajoUrl, userId, allUsers);
        }
      }
    }
  } catch (error) {
    console.error(`[WOService:updateTrabajo] Error actualizando trabajo ${trabajoId} en orden ${ordenId}:`, error);
    throw error;
  }
};


export const cancelTrabajoInOrdenBySolicitudId = async (
  solicitudId: string,
  motivoCancelacion: string,
  userId: string
): Promise<OrdenDeTrabajo | null> => {
  
  const allOrdersSnapshot = await getDocs(collection(db, ORDENES_DE_TRABAJO_COLLECTION));
  let targetOrder: OrdenDeTrabajo | null = null;
  let targetTrabajoId: string | null = null;

  for (const docSnap of allOrdersSnapshot.docs) {
    const order = mapOrderDocumentToOrdenDeTrabajo(docSnap);
    const trabajoFound = order.trabajos.find(t => t.solicitudId === solicitudId && t.estado !== "Cancelado");
    if (trabajoFound) {
      targetOrder = order;
      targetTrabajoId = trabajoFound.id;
      break;
    }
  }

  if (targetOrder && targetTrabajoId) {
    const trabajoUpdates: Partial<Omit<Trabajo, 'id' | 'solicitudId' | 'equipoId' | 'tipoTrabajo'>> = {
      estado: "Cancelado",
      motivoCancelacion: motivoCancelacion,
    };
    await updateTrabajoInOrden(targetOrder.id, targetTrabajoId, trabajoUpdates, userId); 
    return getWorkOrderById(targetOrder.id);
  } else {
    return null; 
  }
};
