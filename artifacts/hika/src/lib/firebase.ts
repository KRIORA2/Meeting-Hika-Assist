import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || "",
  };
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

export function getFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Set the VITE_FIREBASE_* values in your environment.");
  }
  if (!app) {
    app = initializeApp(getFirebaseConfig());
    auth = getAuth(app);
  }
  return auth!;
}
