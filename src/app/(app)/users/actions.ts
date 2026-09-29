'use server';

import * as admin from 'firebase-admin';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

interface CreateUserPayload {
  email: string;
  password; string;
}

interface ManageUserStatusPayload {
  targetUid: string;
  newStatus: 'activo' | 'inactivo';
  reason: string;
  adminUid: string;
}

function initializeAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  try {
    const keyFilePath = path.join(process.cwd(), 'serviceAccountKey.json');
    const serviceAccountString = fs.readFileSync(keyFilePath, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountString);

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e: any) {
    let errorMessage = 'Las credenciales en el archivo serviceAccountKey.json parecen estar malformadas. Verifique el archivo.';
    if (e.code === 'ENOENT') {
      errorMessage = 'No se encontró el archivo serviceAccountKey.json en la raíz del proyecto.';
    } else if (e instanceof SyntaxError) {
      errorMessage = 'Error de sintaxis al leer serviceAccountKey.json. Asegúrese de que sea un JSON válido.';
    }
    console.error("Error initializing Firebase Admin SDK:", e.message);
    const err = new Error(errorMessage);
    err.name = 'AdminSDKInitializationError';
    throw err;
  }
}

export async function createUser(payload: CreateUserPayload) {
  const { email, password } = payload;
  if (!email || !password) {
    throw new Error('Email y contraseña son requeridos.');
  }

  try {
    const adminApp = initializeAdminApp();
    const auth = adminApp.auth();

    const userRecord = await auth.createUser({
        email: email,
        password: password,
        emailVerified: false,
        disabled: false,
    });

    return { success: true, uid: userRecord.uid };

  } catch (error: any) {
      console.error('Error in createUser server action:', error);
      if (error.code === 'auth/email-already-exists') {
          throw new Error('El correo electrónico ya está en uso por otra cuenta.');
      }
      if (error.code === 'auth/invalid-password') {
          throw new Error('La contraseña debe tener al menos 6 caracteres.');
      }
      if (error.code === 'auth/invalid-email') {
          throw new Error('El formato del correo electrónico no es válido.');
      }
      throw new Error(error.message || 'Ocurrió un error al crear el usuario en Firebase Authentication.');
  }
}


export async function manageUserStatus(payload: ManageUserStatusPayload) {
  const { targetUid, newStatus, reason, adminUid } = payload;

  if (!targetUid || !newStatus || !reason || !adminUid) {
    throw new Error('Faltan parámetros para actualizar el estado del usuario.');
  }

  try {
    const adminApp = initializeAdminApp();
    const auth = adminApp.auth();
    const firestore = adminApp.firestore(); // Get Admin Firestore instance

    // 1. Update Firebase Authentication status
    await auth.updateUser(targetUid, {
      disabled: newStatus === 'inactivo',
    });

    // 2. Update Firestore profile status and history using Admin SDK
    const userDocRef = firestore.collection('users').doc(targetUid);
    const newHistoryEntry = {
      estado: newStatus,
      fecha: new Date(), // Admin SDK handles Date object conversion to Timestamp
      modificadoPor: adminUid,
      motivo: reason,
    };
    
    // Use the Admin SDK's FieldValue for arrayUnion
    await userDocRef.update({
        estado: newStatus,
        estadoHistorial: admin.firestore.FieldValue.arrayUnion(newHistoryEntry)
    });

    // 3. Revalidate the users page to show the change immediately
    revalidatePath('/users');

    return { success: true, message: `Usuario ${newStatus === 'activo' ? 'reactivado' : 'desactivado'} correctamente.` };

  } catch (error: any) {
    console.error('Error in manageUserStatus server action:', error);
    
    if (error.name === 'AdminSDKInitializationError') {
        throw new Error(error.message);
    }
    
    const errorMessage = error.code === 'auth/user-not-found'
      ? `El usuario con UID ${targetUid} no fue encontrado en Firebase Authentication.`
      : `Ocurrió un error inesperado al gestionar el usuario: ${error.message || 'Error desconocido.'}`;
      
    throw new Error(errorMessage);
  }
}
