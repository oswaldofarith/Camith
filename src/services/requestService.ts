import { db } from '@/lib/firebase/firebase';
import type { Solicitud, UserProfile, AppSettingsState } from '@/types'; 
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  where,
  limit,
  deleteDoc,
  writeBatch,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { getUsers } from './userService'; 
import { createNotificationsForUsers } from './notificationService'; 

const SOLICITUDES_COLLECTION = 'solicitudes';

// Helper to convert Firestore Timestamps to Dates in a solicitud object
const mapSolicitudDocument = (docSnap: any): Solicitud => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data, 
    fechaSolicitud: (data.fechaSolicitud instanceof Timestamp) ? data.fechaSolicitud.toDate() : new Date(),
    fechaProgramada: (data.fechaProgramada instanceof Timestamp) ? data.fechaProgramada.toDate() : new Date(),
    tiempoServicioEstimado: data.tiempoServicioEstimado === undefined ? undefined : data.tiempoServicioEstimado,
  } as Solicitud; 
};

export const getSolicitudById = async (id: string): Promise<Solicitud | null> => {
  try {
    const docRef = doc(db, SOLICITUDES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapSolicitudDocument(docSnap);
    }
    return null;
  } catch (error) {
    console.error("Error fetching solicitud by ID: ", error);
    throw error;
  }
};

export const addSolicitud = async (
  solicitudData: Omit<Solicitud, 'id' | 'fechaSolicitud' | 'estado' | 'displayId' | 'motivoCancelacion'> & { 
    creadoPor: string; 
    fechaProgramada: Date; 
    descripcion?: string;
    tiempoServicioEstimado?: number;
  }
): Promise<Solicitud> => {
  let docRef;
  try {
    const dataToSave: any = {
      ...solicitudData,
      fechaSolicitud: serverTimestamp(),
      estado: 'pendiente' as Solicitud['estado'],
      tiempoServicioEstimado: solicitudData.tiempoServicioEstimado ?? 60,
    };

    if (solicitudData.descripcion && solicitudData.descripcion.trim() !== "") {
      dataToSave.descripcion = solicitudData.descripcion.trim();
    }

    docRef = await addDoc(collection(db, SOLICITUDES_COLLECTION), dataToSave);
    
    const fechaProg = solicitudData.fechaProgramada; 
    const year = fechaProg.getFullYear();
    const month = (fechaProg.getMonth() + 1).toString().padStart(2, '0');
    const day = fechaProg.getDate().toString().padStart(2, '0');
    const formattedDate = `${year}${month}${day}`;
    const pseudoSequential = docRef.id.substring(0, 5).toUpperCase();
    const displayIdValue = `SOL-${formattedDate}-${pseudoSequential}`;

    await updateDoc(docRef, { displayId: displayIdValue });

    const initialDocSnap = await getDoc(docRef);
    const finalSolicitud = mapSolicitudDocument(initialDocSnap);

    try {
        const allUsers = await getUsers();
        const supervisorUserIds = allUsers
            .filter(u => u.perfiles.includes("supervisor"))
            .map(u => u.id);
        
        if (supervisorUserIds.length > 0) {
            await createNotificationsForUsers(
                supervisorUserIds,
                 (recipientProfile, sourceUserProfile) => `Nueva solicitud ${displayIdValue} para equipo ${solicitudData.equipoId} creada por ${sourceUserProfile?.nombre || solicitudData.creadoPor}.`,
                "nueva_solicitud",
                docRef.id, 
                `/requests`, 
                solicitudData.creadoPor, 
                allUsers 
            );
        }
    } catch (notifError) {
        console.warn("Failed to notify supervisors:", notifError);
    }
    return finalSolicitud;

  } catch (error) {
    console.error("Error general en addSolicitud:", error);
    throw error;
  }
};


export const getSolicitudes = async (): Promise<Solicitud[]> => {
  try {
    const q = query(collection(db, SOLICITUDES_COLLECTION), orderBy('fechaSolicitud', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(mapSolicitudDocument);
  } catch (error) {
    console.error("Error fetching solicitudes: ", error);
    throw error;
  }
};

export const getPendingRequestForEquipment = async (equipoId: string): Promise<Solicitud | null> => {
  try {
    const q = query(
      collection(db, SOLICITUDES_COLLECTION),
      where("equipoId", "==", equipoId),
      where("estado", "==", "pendiente"),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return mapSolicitudDocument(querySnapshot.docs[0]);
    }
    return null;
  } catch (error) {
    console.error("Error fetching pending request for equipment:", error);
    throw error;
  }
};

export const deleteSolicitud = async (solicitudId: string): Promise<void> => {
  try {
    const docRef = doc(db, SOLICITUDES_COLLECTION, solicitudId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting solicitud:", error);
    throw error;
  }
};

export const updateSolicitudEstado = async (
  solicitudId: string, 
  nuevoEstado: Solicitud['estado'],
  motivoCancelacion?: string
): Promise<void> => {
  try {
    const docRef = doc(db, SOLICITUDES_COLLECTION, solicitudId);
    const updateData: { estado: Solicitud['estado'], motivoCancelacion?: string | ReturnType<typeof deleteField> } = { estado: nuevoEstado };
    
    if (nuevoEstado === 'cancelada' && motivoCancelacion && motivoCancelacion.trim() !== "") {
      updateData.motivoCancelacion = motivoCancelacion.trim();
    } else if (nuevoEstado !== 'cancelada') {
      updateData.motivoCancelacion = deleteField();
    }

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error(`Error updating solicitud ${solicitudId} estado: `, error);
    throw error;
  }
};
