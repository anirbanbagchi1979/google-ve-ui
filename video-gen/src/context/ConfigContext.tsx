"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface AppConfig {
  projectId: string;
  location: string;
  gcsBucket: string;
  outputFolder: string;
  videoGenModel: string;
  upscaleModel: string;
  pollIntervalSeconds: number;
  // Backbone Infra
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseProjectId: string;
  firebaseStorageBucket: string;
  firebaseMessagingSenderId: string;
  firebaseAppId: string;
  firestoreDbId: string;
}

interface ConfigContextType {
  config: AppConfig;
  updateConfig: (newConfig: Partial<AppConfig>) => void;
  resetConfig: () => void;
}

const DEFAULT_CONFIG: AppConfig = {
  projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID || "",
  location: "us-central1",
  gcsBucket: process.env.NEXT_PUBLIC_GCS_BUCKET || "",
  outputFolder: "outputs",
  videoGenModel: "veo-001",
  upscaleModel: "veo-experimental",
  pollIntervalSeconds: 10,
  // Backbone Defaults
  firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  firebaseStorageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  firebaseMessagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  firestoreDbId: process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DB_ID || "",
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("veo_dashboard_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // Auto-fix migration for invalid upscale model ID
        if (parsed.upscaleModel === "veo3p1_upscale") {
          parsed.upscaleModel = "veo-experimental";
          localStorage.setItem("veo_dashboard_config", JSON.stringify(parsed));
        }
        
        setConfig(parsed);
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
  }, []);

  const updateConfig = (newConfig: Partial<AppConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    localStorage.setItem("veo_dashboard_config", JSON.stringify(updated));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem("veo_dashboard_config");
  };

  return (
    <ConfigContext.Provider value={{ config, updateConfig, resetConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
};
