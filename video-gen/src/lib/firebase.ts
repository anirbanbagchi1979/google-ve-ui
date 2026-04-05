import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

const getStoredConfig = () => {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("veo_dashboard_config");
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (e) {
    return null;
  }
};

const savedConfig = getStoredConfig();

const firebaseConfig = {
  apiKey: savedConfig?.firebaseApiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: savedConfig?.firebaseAuthDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: savedConfig?.firebaseProjectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: savedConfig?.firebaseStorageBucket || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: savedConfig?.firebaseMessagingSenderId || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: savedConfig?.firebaseAppId || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firestoreDbId = savedConfig?.firestoreDbId || process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DB_ID || "video-gen-bb";

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Initialize Storage
const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

// Initialize Firestore
const db = getFirestore(app, firestoreDbId);

export { app, auth, storage, db };
