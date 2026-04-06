"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { onAuthUIStateChange } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  setToken: (token: string | null) => void;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  loading: true,
  setToken: () => {},
  getIdToken: async () => null,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Persistence for the token (simple approach for this demo)
  useEffect(() => {
    const savedToken = localStorage.getItem("gcp_access_token");
    if (savedToken) setAccessToken(savedToken);
  }, []);

  const setToken = (token: string | null) => {
    setAccessToken(token);
    if (token) {
      localStorage.setItem("gcp_access_token", token);
    } else {
      localStorage.removeItem("gcp_access_token");
    }
  };

  // Returns a fresh Firebase ID token — auto-refreshes if expired
  const getIdToken = async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthUIStateChange(async (user) => {
      setUser(user);
      setLoading(false);

      if (user) {
        try {
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Error storing user in Firestore:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, setToken, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
