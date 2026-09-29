

import { db } from '@/lib/firebase/firebase';
import type { Equipo, GeoPoint, EstadoHistorialEntry } from '@/types';
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
  where,
} from 'firebase/firestore';

const EQUIPOS_COLLECTION = 'equipos';

// Helper to convert Firestore Timestamps to Dates in an equipment object
const mapEquipoDocumentToEquipo = (docData: any): Equipo => {
  const data = { ...docData } as any;
  if (data.fechaUltimaRevision instanceof Timestamp) {
    data.fechaUltimaRevision = data.fechaUltimaRevision.toDate();
  } else if (data.fechaUltimaRevision === null || data.fechaUltimaRevision === undefined) {
    data.fechaUltimaRevision = null; 
  }

  if (data.proximoMantenimientoProgramado instanceof Timestamp) {
    data.proximoMantenimientoProgramado = data.proximoMantenimientoProgramado.toDate();
  } else {
    data.proximoMantenimientoProgramado = null;
  }

  if (data.estadoHistorial && Array.isArray(data.estadoHistorial)) {
    data.estadoHistorial = data.estadoHistorial.map((entry: any) => ({
      ...entry,
      fecha: entry.fecha instanceof Timestamp ? entry.fecha.toDate() : new Date(entry.fecha), // Handle if already Date string
    }));
  } else {
    data.estadoHistorial = [];
  }
  
  data.intervaloMantenimientoDias = data.intervaloMantenimientoDias === undefined ? null : data.intervaloMantenimientoDias;
  data.intervaloMantenimientoRevisiones = data.intervaloMantenimientoRevisiones === undefined ? null : data.intervaloMantenimientoRevisiones;


  if (data.coordenadas && typeof data.coordenadas.latitude === 'number' && typeof data.coordenadas.longitude === 'number') {
    // It's already in the desired format or a Firestore GeoPoint that serializes this way
  } else {
    data.coordenadas = { latitude: 0, longitude: 0 }; 
  }
  // Add default for estado if not present
  data.estado = data.estado || "Activo";

  return data as Equipo;
};

export const getEquipos = async (): Promise<Equipo[]> => {
  try {
    const q = query(collection(db, EQUIPOS_COLLECTION));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => ({
      ...mapEquipoDocumentToEquipo(docSnap.data()),
      id: docSnap.id,
    }));
  } catch (error) {
    console.error("Error fetching equipos: ", error);
    throw error;
  }
};

export const getEquipoById = async (id: string): Promise<Equipo | null> => {
  try {
    const docRef = doc(db, EQUIPOS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { ...mapEquipoDocumentToEquipo(docSnap.data()), id: docSnap.id };
    }
    return null;
  } catch (error) {
    console.error("Error fetching equipo by ID: ", error);
    throw error;
  }
};

// Actualizar la firma de addEquipo
export const addEquipo = async (
  idCustom: string, 
  equipoData: Omit<Equipo, 'id' | 'fechaUltimaRevision' | 'revisionCount' | 'estadoHistorial'> 
): Promise<string> => {
  try {
    const docRef = doc(db, EQUIPOS_COLLECTION, idCustom);
    
    const initialEstado = equipoData.estado || "Activo";
    const initialEstadoHistorialEntry: EstadoHistorialEntry = {
      estado: initialEstado,
      fecha: new Date(),
      modificadoPor: "Creación Inicial", // Placeholder
    };

    const dataToSave = {
      ...equipoData,
      fechaUltimaRevision: null, 
      revisionCount: 0,        
      estado: initialEstado,
      estadoHistorial: [initialEstadoHistorialEntry],
      proximoMantenimientoProgramado: equipoData.proximoMantenimientoProgramado instanceof Date ? Timestamp.fromDate(equipoData.proximoMantenimientoProgramado) : null,
      intervaloMantenimientoDias: equipoData.intervaloMantenimientoDias ?? 365,
      intervaloMantenimientoRevisiones: equipoData.intervaloMantenimientoRevisiones ?? null,
      camposAdicionales: equipoData.camposAdicionales || {},
    };
    await setDoc(docRef, dataToSave);
    return idCustom; 
  } catch (error) {
    console.error("Error adding equipo: ", error);
    throw error;
  }
};

export const updateEquipo = async (id: string, equipoData: Partial<Omit<Equipo, 'id'>>): Promise<void> => {
  try {
    const docRef = doc(db, EQUIPOS_COLLECTION, id);
    const currentDocSnap = await getDoc(docRef);

    if (!currentDocSnap.exists()) {
      throw new Error(`Equipo con ID ${id} no encontrado.`);
    }

    const currentData = mapEquipoDocumentToEquipo(currentDocSnap.data());
    const dataToUpdate = { ...equipoData };
    
    if (dataToUpdate.proximoMantenimientoProgramado instanceof Date) {
      dataToUpdate.proximoMantenimientoProgramado = Timestamp.fromDate(dataToUpdate.proximoMantenimientoProgramado);
    } else if (dataToUpdate.proximoMantenimientoProgramado === null || dataToUpdate.proximoMantenimientoProgramado === undefined) {
      dataToUpdate.proximoMantenimientoProgramado = null;
    }
    
    if (dataToUpdate.intervaloMantenimientoDias === undefined) dataToUpdate.intervaloMantenimientoDias = null;
    if (dataToUpdate.intervaloMantenimientoRevisiones === undefined) dataToUpdate.intervaloMantenimientoRevisiones = null;


    let updatedEstadoHistorial = currentData.estadoHistorial ? [...currentData.estadoHistorial] : [];

    if (equipoData.estado && equipoData.estado !== currentData.estado) {
      const newHistoryEntry: EstadoHistorialEntry = {
        estado: equipoData.estado,
        fecha: new Date(), // Timestamp will be applied by Firestore on write
        modificadoPor: "Actualización Sistema", // Placeholder
        // motivo: "TODO: Implementar motivo si es necesario"
      };
      updatedEstadoHistorial.push(newHistoryEntry);
      dataToUpdate.estadoHistorial = updatedEstadoHistorial.map(entry => ({
          ...entry,
          fecha: entry.fecha instanceof Date ? Timestamp.fromDate(entry.fecha) : entry.fecha, // Ensure it's Timestamp for FS
      })) as any;
    } else if (dataToUpdate.estadoHistorial) { // If history is being passed directly (less likely from form)
         dataToUpdate.estadoHistorial = dataToUpdate.estadoHistorial.map(entry => ({
             ...entry,
             fecha: entry.fecha instanceof Date ? Timestamp.fromDate(entry.fecha) : entry.fecha,
         })) as any;
    }


    await updateDoc(docRef, dataToUpdate);
  } catch (error) {
    console.error("Error updating equipo: ", error);
    throw error;
  }
};

export const deleteEquipo = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, EQUIPOS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting equipo: ", error);
    throw error;
  }
};

