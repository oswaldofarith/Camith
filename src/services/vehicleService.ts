
import { db } from '@/lib/firebase/firebase';
import type { Vehiculo } from '@/types';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  // orderBy, // Temporarily removed for debugging
  Timestamp,
} from 'firebase/firestore';

const VEHICULOS_COLLECTION = 'vehiculos';

// Helper to convert Firestore Timestamps if any
const mapVehicleDocumentToVehiculo = (docData: any, id: string): Vehiculo => {
  console.log(`vehicleService: mapVehicleDocumentToVehiculo - Mapping document ID: ${id}, Data:`, JSON.stringify(docData));
  return {
    id, // This is the document ID
    placa: docData.placa || '',
    tipo: docData.tipo || 'camionetaCabinaSimple', // Default if not present
    estado: docData.estado || 'disponible', // Default if not present
    custodioId: docData.custodioId || undefined, // Ensure custodioId is included
  } as Vehiculo;
};

export const getVehiculos = async (): Promise<Vehiculo[]> => {
  try {
    console.log(`vehicleService: getVehiculos called. Querying collection constant: "${VEHICULOS_COLLECTION}"`); // Added this log
    const q = query(collection(db, VEHICULOS_COLLECTION)/*, orderBy('id')*/); // orderBy removed for now
    const querySnapshot = await getDocs(q);

    console.log(`vehicleService: querySnapshot.empty = ${querySnapshot.empty}, querySnapshot.size = ${querySnapshot.size}`);

    if (querySnapshot.empty) {
      console.log(`vehicleService: No documents found in "${VEHICULOS_COLLECTION}" collection from Firestore query.`);
      return [];
    }

    console.log(`vehicleService: Found ${querySnapshot.docs.length} documents. Raw docs:`);
    querySnapshot.docs.forEach(d => {
      console.log(`vehicleService: Raw doc ID: ${d.id}, Data:`, JSON.stringify(d.data()));
    });

    const vehicles = querySnapshot.docs.map(docSnap => mapVehicleDocumentToVehiculo(docSnap.data(), docSnap.id));
    console.log("vehicleService: Mapped vehicles:", vehicles);
    return vehicles;
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      console.error("vehicleService: Firestore permission denied while trying to get vehiculos.", error);
      throw new Error("Permiso denegado por Firestore al obtener vehículos. Verifique las reglas de seguridad.");
    }
    console.error("vehicleService: Error fetching vehiculos: ", error);
    throw error; // Re-throw original error
  }
};

export const getVehiculoById = async (id: string): Promise<Vehiculo | null> => {
  try {
    const docRef = doc(db, VEHICULOS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapVehicleDocumentToVehiculo(docSnap.data(), docSnap.id);
    }
    return null;
  } catch (error) {
    console.error("Error fetching vehiculo by ID: ", error);
    throw error;
  }
};

export const addVehiculo = async (vehicleData: Vehiculo): Promise<string> => {
  try {
    // Use vehicleData.id (e.g., "G-001") as the document ID in Firestore
    const docRef = doc(db, VEHICULOS_COLLECTION, vehicleData.id);
    // Don't save the 'id' field itself inside the document if it's the doc ID,
    // unless you explicitly want/need it for querying/ordering.
    // For now, assuming 'id' is only the document key.
    const { id, ...dataToSet } = vehicleData;
    await setDoc(docRef, dataToSet);
    return vehicleData.id; // Return the ID used for the document
  } catch (error) {
    console.error("Error adding vehiculo: ", error);
    throw error;
  }
};

export const updateVehiculo = async (id: string, vehicleData: Partial<Omit<Vehiculo, 'id'>>): Promise<void> => {
  try {
    const docRef = doc(db, VEHICULOS_COLLECTION, id);
    await updateDoc(docRef, vehicleData);
  } catch (error) {
    console.error("Error updating vehiculo: ", error);
    throw error;
  }
};

export const deleteVehiculo = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, VEHICULOS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting vehiculo: ", error);
    throw error;
  }
};

