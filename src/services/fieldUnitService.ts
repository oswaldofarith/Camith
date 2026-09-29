
import { db } from '@/lib/firebase/firebase';
import type { UnidadDeCampo } from '@/types';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  query,
} from 'firebase/firestore';

const FIELD_UNITS_COLLECTION = 'fieldUnitCompositions';

export const getSavedFieldUnitCompositions = async (): Promise<UnidadDeCampo[]> => {
  const compositions: UnidadDeCampo[] = [];
  try {
    const q = query(collection(db, FIELD_UNITS_COLLECTION));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      compositions.push({
        id: docSnap.id, // This is vehiculoId
        vehiculoId: data.vehiculoId || docSnap.id, // Ensure vehiculoId is present
        tecnicos: data.tecnicos || [],
      });
    });
    console.log("[fieldUnitService] Fetched compositions:", compositions);
    return compositions;
  } catch (error) {
    console.error("Error fetching saved field unit compositions: ", error);
    throw error;
  }
};

export const saveFieldUnitCompositions = async (compositions: UnidadDeCampo[]): Promise<void> => {
  try {
    const batch = writeBatch(db);
    console.log("[fieldUnitService] Saving compositions:", compositions);

    // To ensure a clean save, first get all existing compositions and delete them.
    // This handles cases where a vehicle might have been removed, and its composition should also be removed.
    const existingCompsSnap = await getDocs(collection(db, FIELD_UNITS_COLLECTION));
    existingCompsSnap.forEach(doc => {
        console.log(`[fieldUnitService] Deleting existing composition for vehicle: ${doc.id}`);
        batch.delete(doc.ref);
    });

    // Then, add the new set of compositions
    compositions.forEach(unit => {
      // 'id' of UnidadDeCampo is the vehiculoId and will be the document ID.
      const docRef = doc(db, FIELD_UNITS_COLLECTION, unit.id); 
      // We store vehiculoId also in the document for clarity, though it's redundant with doc ID.
      const dataToSave = {
        vehiculoId: unit.vehiculoId,
        tecnicos: unit.tecnicos
      };
      batch.set(docRef, dataToSave);
    });

    await batch.commit();
    console.log("[fieldUnitService] Compositions saved successfully.");
  } catch (error) {
    console.error("Error saving field unit compositions: ", error);
    throw error;
  }
};
