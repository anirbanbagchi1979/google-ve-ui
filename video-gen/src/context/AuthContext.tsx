"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { onAuthUIStateChange } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { COLLECTIONS } from "@/constants";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAllowed: boolean;
  isAdmin: boolean;
  allowlistChecked: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAllowed: false,
  isAdmin: false,
  allowlistChecked: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allowlistChecked, setAllowlistChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthUIStateChange(async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (!firebaseUser) {
        setIsAllowed(false);
        setIsAdmin(false);
        setAllowlistChecked(true);
        return;
      }

      // Track login (non-fatal)
      try {
        await setDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid), {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          lastLogin: serverTimestamp(),
        }, { merge: true });
      } catch { /* non-fatal */ }

      // Check allowlist — doc ID must equal the email address
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.ALLOWLIST, firebaseUser.email ?? ""));
        setIsAllowed(snap.exists());
        setIsAdmin(snap.exists() && snap.data()?.isAdmin === true);
      } catch {
        setIsAllowed(false);
        setIsAdmin(false);
      } finally {
        setAllowlistChecked(true);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAllowed, isAdmin, allowlistChecked }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
