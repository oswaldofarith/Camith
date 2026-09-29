
import { db } from '@/lib/firebase/firebase';
import type { AppSettingsState } from '@/types';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const APP_SETTINGS_COLLECTION = 'appConfiguration'; // Collection name
const APP_SETTINGS_DOC_ID = 'mainSettings'; // Single document ID to store all settings

export const getAppSettings = async (): Promise<AppSettingsState | null> => {
  try {
    const docRef = doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AppSettingsState;
    }
    console.log("No settings document found, returning null.");
    return null; // No settings document found
  } catch (error) {
    console.error("Error fetching app settings: ", error);
    throw error;
  }
};

export const saveAppSettings = async (settings: AppSettingsState): Promise<void> => {
  try {
    const docRef = doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID);
    await setDoc(docRef, settings, { merge: true }); // Use merge: true to update, or setDoc without merge to overwrite
    console.log("App settings saved successfully.");
  } catch (error) {
    console.error("Error saving app settings: ", error);
    throw error;
  }
};
