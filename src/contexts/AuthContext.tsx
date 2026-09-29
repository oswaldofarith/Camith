
"use client";

import type React from "react";
import { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/firebase';
import type { UserProfile } from '@/types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  login: (email_param: string, password_param: string) => Promise<void>; // Renamed parameters to avoid conflict
  logout: () => Promise<void>;
  setUserProfileData: (uid: string, profileData: Omit<UserProfile, 'id'>) => Promise<void>; // To set profile in Firestore
  updateUserProfileData: (uid: string, profileData: Partial<Omit<UserProfile, 'id'>>) => Promise<void>; // To update profile in Firestore
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch user profile from Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserProfile({ id: user.uid, ...userDocSnap.data() } as UserProfile);
        } else {
          // Potentially handle case where profile doesn't exist, e.g., logout or redirect
          console.warn(`User profile not found for UID: ${user.uid}. Logging out.`);
          setUserProfile(null);
          // await firebaseSignOut(auth); // Or handle differently
        }
      } else {
        setUserProfile(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isLoading && !currentUser && pathname !== '/login') {
      router.push('/login');
    }
  }, [currentUser, isLoading, pathname, router]);


  const login = async (email_param: string, password_param: string) => {
    await signInWithEmailAndPassword(auth, email_param, password_param);
    // onAuthStateChanged will handle setting user and profile
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
    router.push('/login');
  };

  const setUserProfileData = async (uid: string, profileData: Omit<UserProfile, 'id'>) => {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, profileData);
     // Optionally re-fetch profile or update local state if it's the current admin adding themselves
    if (currentUser?.uid === uid) {
        setUserProfile({ id: uid, ...profileData } as UserProfile);
    }
  };
  
  const updateUserProfileData = async (uid: string, profileData: Partial<Omit<UserProfile, 'id'>>) => {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, profileData, { merge: true });
    if (currentUser?.uid === uid) {
        const updatedProfileSnap = await getDoc(userDocRef);
        if (updatedProfileSnap.exists()) {
            setUserProfile({ id: uid, ...updatedProfileSnap.data()} as UserProfile)
        }
    }
  };


  return (
    <AuthContext.Provider value={{ currentUser, userProfile, isLoading, login, logout, setUserProfileData, updateUserProfileData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
