
import { db } from '@/lib/firebase/firebase';
import type { PlanDeMantenimiento } from '@/types';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
} from 'firebase/firestore';

const PLANS_COLLECTION = 'planesDeMantenimiento';

const mapPlanDocumentToPlan = (docSnap: any): PlanDeMantenimiento => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    fechaCreacion: (data.fechaCreacion as Timestamp).toDate(),
    calendario: data.calendario?.map((item: any) => ({
      ...item,
      fechaProgramada: (item.fechaProgramada as Timestamp).toDate(),
    })) || [],
  } as PlanDeMantenimiento;
};

export const getMaintenancePlans = async (): Promise<PlanDeMantenimiento[]> => {
  try {
    const q = query(collection(db, PLANS_COLLECTION), orderBy('fechaCreacion', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(mapPlanDocumentToPlan);
  } catch (error) {
    console.error("Error fetching maintenance plans: ", error);
    throw error;
  }
};

export const getMaintenancePlanById = async (id: string): Promise<PlanDeMantenimiento | null> => {
  try {
    const docRef = doc(db, PLANS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapPlanDocumentToPlan(docSnap);
    }
    return null;
  } catch (error) {
    console.error("Error fetching maintenance plan by ID: ", error);
    throw error;
  }
};

export const addMaintenancePlan = async (planData: Omit<PlanDeMantenimiento, 'id'>): Promise<string> => {
    try {
        const dataToSave = {
            ...planData,
            fechaCreacion: Timestamp.fromDate(planData.fechaCreacion),
            calendario: planData.calendario.map(item => ({
                ...item,
                fechaProgramada: Timestamp.fromDate(item.fechaProgramada),
            }))
        };
        const docRef = await addDoc(collection(db, PLANS_COLLECTION), dataToSave);
        return docRef.id;
    } catch (error) {
        console.error("Error adding maintenance plan: ", error);
        throw error;
    }
};

export const updateMaintenancePlan = async (id: string, planData: Partial<Omit<PlanDeMantenimiento, 'id'>>): Promise<void> => {
    try {
        const docRef = doc(db, PLANS_COLLECTION, id);
        const dataToUpdate: any = {...planData};

        // Convert dates back to Timestamps if they are present in the update
        if (dataToUpdate.fechaCreacion instanceof Date) {
            dataToUpdate.fechaCreacion = Timestamp.fromDate(dataToUpdate.fechaCreacion);
        }
        if (dataToUpdate.calendario) {
            dataToUpdate.calendario = dataToUpdate.calendario.map((item: any) => ({
                ...item,
                fechaProgramada: item.fechaProgramada instanceof Date ? Timestamp.fromDate(item.fechaProgramada) : item.fechaProgramada,
            }));
        }

        await updateDoc(docRef, dataToUpdate);
    } catch (error) {
        console.error("Error updating maintenance plan: ", error);
        throw error;
    }
}


export const deleteMaintenancePlan = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, PLANS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting maintenance plan: ", error);
    throw error;
  }
};
