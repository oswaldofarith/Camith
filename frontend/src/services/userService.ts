
import { db } from '@/lib/firebase/firebase';
import type { UserProfile, EstadoHistorialEntry } from '@/types';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  query,
  updateDoc,
  arrayUnion,
  // orderBy, // Temporarily removed for diagnosis
  Timestamp,
} from 'firebase/firestore';

const USERS_COLLECTION = 'users';

// Helper to convert Firestore Timestamps
const mapUserDocumentToUserProfile = (docData: any, id: string): UserProfile => {
  const data = { ...docData } as any;

  if (data.estadoHistorial && Array.isArray(data.estadoHistorial)) {
    data.estadoHistorial = data.estadoHistorial.map((entry: any) => ({
      ...entry,
      fecha: entry.fecha instanceof Timestamp ? entry.fecha.toDate() : new Date(entry.fecha),
    }));
  }

  return {
    id,
    nombre: data.nombre || '',
    email: data.email || '',
    cedula: data.cedula || '',
    fotoUrl: data.fotoUrl || undefined,
    estado: data.estado || 'inactivo',
    habilidades: data.habilidades || [],
    perfiles: data.perfiles || [],
    numeroRol: data.numeroRol || undefined,
    estadoHistorial: data.estadoHistorial || [],
  } as UserProfile;
};

export const getUsers = async (): Promise<UserProfile[]> => {
  try {
    const q = query(collection(db, USERS_COLLECTION));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => mapUserDocumentToUserProfile(docSnap.data(), docSnap.id));
  } catch (error) {
    console.error("Error fetching users: ", error);
    throw error;
  }
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapUserDocumentToUserProfile(docSnap.data(), docSnap.id);
    }
    return null;
  } catch (error) {
    console.error("Error fetching user profile: ", error);
    throw error;
  }
};

export const setUserProfile = async (uid: string, profileData: Omit<UserProfile, 'id' | 'estadoHistorial'>): Promise<void> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    const dataToSave: any = { ...profileData };

    // Initialize estadoHistorial
    const initialHistoryEntry: EstadoHistorialEntry = {
      estado: profileData.estado,
      fecha: new Date(),
      modificadoPor: 'Sistema',
      motivo: 'Creación de usuario'
    };
    dataToSave.estadoHistorial = [initialHistoryEntry];
    
    await setDoc(docRef, dataToSave);
  } catch (error) {
    console.error("Error setting user profile: ", error);
    throw error;
  }
};

export const updateUserProfile = async (uid: string, profileData: Partial<Omit<UserProfile, 'id' | 'estadoHistorial'>>): Promise<void> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    await setDoc(docRef, profileData, { merge: true });
  } catch (error) {
    console.error("Error updating user profile: ", error);
    throw error;
  }
};

export const updateUserStatusInFirestore = async (
  uid: string,
  newStatus: 'activo' | 'inactivo',
  reason: string,
  adminUid: string
): Promise<void> => {
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    const newHistoryEntry: EstadoHistorialEntry = {
      estado: newStatus,
      fecha: new Date(),
      modificadoPor: adminUid,
      motivo: reason,
    };
    
    // Use Firestore's arrayUnion to add to the history and update the status
    await updateDoc(docRef, {
      estado: newStatus,
      estadoHistorial: arrayUnion({
        ...newHistoryEntry,
        fecha: Timestamp.fromDate(newHistoryEntry.fecha) // Convert to Firestore Timestamp for storage
      })
    });
  } catch (error) {
    console.error("Error updating user status in Firestore:", error);
    throw error;
  }
};


export const deleteUserProfile = async (uid: string): Promise<void> => {
  try {
    // Note: This only deletes the Firestore profile.
    const docRef = doc(db, USERS_COLLECTION, uid);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting user profile: ", error);
    throw error;
  }
};
