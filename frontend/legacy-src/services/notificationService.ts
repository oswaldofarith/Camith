
import { db } from '@/lib/firebase/firebase';
import type { Notificacion, UserProfile } from '@/types';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';

const NOTIFICACIONES_COLLECTION = 'notificaciones';

const mapNotificationDocument = (docSnap: any): Notificacion => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    fechaCreacion: (data.fechaCreacion instanceof Timestamp) ? data.fechaCreacion.toDate() : new Date(),
  } as Notificacion;
};

export const createNotification = async (
  userId: string, // Target user ID
  mensaje: string,
  tipo?: Notificacion['tipo'],
  entidadId?: string,
  entidadUrl?: string,
  creadaPor?: string, // User ID of the event originator
  creadaPorNombre?: string, // Name of the event originator
): Promise<string> => {
  console.log(`[NotifService:createNotification] START. Target UserID: ${userId}, Message: "${mensaje}", Type: ${tipo || 'info_general'}, EntityID: ${entidadId || 'N/A'}, CreatedBy (Name): ${creadaPorNombre || creadaPor || 'Sistema'}`);
  try {
    const docRef = await addDoc(collection(db, NOTIFICACIONES_COLLECTION), {
      userId,
      mensaje,
      tipo: tipo || 'info_general',
      entidadId: entidadId || null,
      entidadUrl: entidadUrl || null,
      creadaPor: creadaPor || null,
      creadaPorNombre: creadaPorNombre || null, 
      fechaCreacion: serverTimestamp(),
      leida: false,
    });
    console.log(`[NotifService:createNotification] SUCCESS. Notification ID: ${docRef.id} for UserID: ${userId}.`);
    return docRef.id;
  } catch (error) {
    console.error(`[NotifService:createNotification] ERROR creating notification for UserID: ${userId}:`, error);
    throw error;
  }
};

export const getNotificationsForUser = async (userId: string, count?: number): Promise<Notificacion[]> => {
  const notificationLimit = count === undefined ? 100 : count; // Default to 100 if count is undefined
  console.log(`[NotifService:getNotificationsForUser] Fetching notifications for user: ${userId}, count: ${notificationLimit}`);
  try {
    const q = query(
      collection(db, NOTIFICACIONES_COLLECTION),
      where('userId', '==', userId),
      orderBy('fechaCreacion', 'desc'),
      limit(notificationLimit)
    );
    const querySnapshot = await getDocs(q);
    const notifications = querySnapshot.docs.map(mapNotificationDocument);
    console.log(`[NotifService:getNotificationsForUser] User ${userId} - Found ${notifications.length} notifications:`, notifications);
    return notifications;
  } catch (error) {
    console.error(`[NotifService:getNotificationsForUser] Error fetching notifications for user ${userId}:`, error);
    throw error;
  }
};

export const getUnreadNotificationCountForUser = async (userId: string): Promise<number> => {
  console.log(`[NotifService:getUnreadNotificationCountForUser] Fetching unread count for user: ${userId}`);
  try {
    const q = query(
      collection(db, NOTIFICACIONES_COLLECTION),
      where('userId', '==', userId),
      where('leida', '==', false)
    );
    const querySnapshot = await getDocs(q);
    console.log(`[NotifService:getUnreadNotificationCountForUser] User ${userId} - Unread count: ${querySnapshot.size}`);
    return querySnapshot.size;
  } catch (error) {
    console.error(`[NotifService:getUnreadNotificationCountForUser] Error fetching unread count for user ${userId}:`, error);
    return 0; 
  }
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    const docRef = doc(db, NOTIFICACIONES_COLLECTION, notificationId);
    await updateDoc(docRef, { leida: true });
  } catch (error) {
    console.error("Error marking notification as read: ", error);
    throw error;
  }
};

export const markAllNotificationsAsReadForUser = async (userId: string): Promise<void> => {
  try {
    const q = query(
      collection(db, NOTIFICACIONES_COLLECTION),
      where('userId', '==', userId),
      where('leida', '==', false)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return;
    }
    const batch = writeBatch(db);
    querySnapshot.forEach(docSnap => {
      batch.update(docSnap.ref, { leida: true });
    });
    await batch.commit();
  } catch (error) {
    console.error("Error marking all notifications as read for user: ", error);
    throw error;
  }
};

export const createNotificationsForUsers = async (
  userIds: string[],
  mensajeTemplate: (recipientProfile?: UserProfile, sourceUserProfile?: UserProfile) => string, 
  tipo?: Notificacion['tipo'],
  entidadId?: string,
  entidadUrl?: string,
  sourceUserId?: string, 
  allUsersData?: UserProfile[] // Este es el array de todos los usuarios
): Promise<void> => {
  const sourceUserProfile = allUsersData?.find(u => u.id === sourceUserId);
  console.log(`[NotifService:createNotificationsForUsers] START. Notifying ${userIds.length} users. Event by: ${sourceUserProfile?.nombre || sourceUserId || 'Sistema'}. AllUsersData received: ${Array.isArray(allUsersData) ? `${allUsersData.length} users` : typeof allUsersData}`);
  
  if (userIds.length === 0) {
    console.log("[NotifService:createNotificationsForUsers] No user IDs to notify, returning.");
    return;
  }

  const batch = writeBatch(db);
  const notificationsCollectionRef = collection(db, NOTIFICACIONES_COLLECTION);

  for (const targetUserId of userIds) {
    if (targetUserId === sourceUserId && tipo !== 'info_general') { 
      console.log(`[NotifService:createNotificationsForUsers] Skipping self-notification for target: ${targetUserId}, type: ${tipo}`);
      continue; 
    }

    const newNotifRef = doc(notificationsCollectionRef);
    
    const targetUserProfile = allUsersData?.find(u => u.id === targetUserId);
    const finalMensaje = mensajeTemplate(targetUserProfile, sourceUserProfile);
    
    console.log(`[NotifService:createNotificationsForUsers] Preparing notification for Target UserID: ${targetUserId} (Name: ${targetUserProfile?.nombre || 'N/A'}). Message: "${finalMensaje}"`);

    batch.set(newNotifRef, {
      userId: targetUserId,
      mensaje: finalMensaje,
      tipo: tipo || 'info_general',
      entidadId: entidadId || null,
      entidadUrl: entidadUrl || null,
      creadaPor: sourceUserId || null,
      creadaPorNombre: sourceUserProfile?.nombre || null,
      fechaCreacion: serverTimestamp(),
      leida: false,
    });
  }
  try {
    await batch.commit();
    console.log(`[NotifService:createNotificationsForUsers] SUCCESS. Batch of notifications committed.`);
  } catch (error) {
    console.error("[NotifService:createNotificationsForUsers] ERROR committing batch of notifications: ", error);
  }
};

