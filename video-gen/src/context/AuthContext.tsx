"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { onAuthUIStateChange } from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  setToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  loading: true,
  setToken: () => {},
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

  useEffect(() => {
    const unsubscribe = onAuthUIStateChange((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, setToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
