import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

export type AuthSession = {
  email: string;
  provider: "password" | "google";
  signedInAt: string;
  expiresAt: string;
};

type AuthResult = {
  ok: boolean;
  message?: string;
};

const SESSION_KEY = "hikaAuthSession";
const SESSION_TOKEN_KEY = "hikaSessionToken";
const API_TOKEN_KEY = "hikaApiToken";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
googleProvider.addScope("email");
googleProvider.addScope("profile");

function getApiUrl() {
  return import.meta.env.VITE_API_URL || "http://localhost:5000";
}

function providerFromUser(user: User): "password" | "google" {
  return user.providerData.some((item) => item.providerId === "google.com") ? "google" : "password";
}

function sessionFromUser(user: User): AuthSession {
  return {
    email: user.email || "",
    provider: providerFromUser(user),
    signedInAt: user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toISOString() : new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 55).toISOString(),
  };
}

async function persistUser(user: User) {
  const token = await user.getIdToken();
  const session = sessionFromUser(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  return session;
}

function firebaseMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Invalid email or password.";
  }
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password") return "Use at least 12 characters for your password.";
  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was cancelled.";
  if (code === "auth/operation-not-allowed") return "This sign-in method is disabled in Firebase Authentication.";
  if (code === "auth/unauthorized-domain") return "Add this domain to Firebase Authentication authorized domains.";
  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid") {
    return "Firebase API key is invalid. Check your VITE_FIREBASE_* environment values.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Authentication failed.";
}

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function getStoredSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export async function getAccessToken(): Promise<string | null> {
  if (!isFirebaseConfigured()) return getStoredSessionToken();
  const user = getFirebaseAuth().currentUser;
  if (!user) return getStoredSessionToken();
  const token = await user.getIdToken();
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  return token;
}

export function getStoredApiToken(): string | null {
  return localStorage.getItem(API_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthSession() || getFirebaseAuthSafeUser());
}

function getFirebaseAuthSafeUser() {
  try {
    return isFirebaseConfigured() ? getFirebaseAuth().currentUser : null;
  } catch {
    return null;
  }
}

export function subscribeAuth(listener: (session: AuthSession | null) => void) {
  if (!isFirebaseConfigured()) {
    listener(getAuthSession());
    return () => undefined;
  }
  return onAuthStateChanged(getFirebaseAuth(), async (user) => {
    if (!user) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_TOKEN_KEY);
      listener(null);
      return;
    }
    listener(await persistUser(user));
  });
}

export function clearAuthState() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function signOut(): Promise<void> {
  try {
    if (isFirebaseConfigured()) await firebaseSignOut(getFirebaseAuth());
  } finally {
    clearAuthState();
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  try {
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    await persistUser(credential.user);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: firebaseMessage(error) };
  }
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  try {
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await persistUser(credential.user);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: firebaseMessage(error) };
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const credential = await signInWithPopup(getFirebaseAuth(), googleProvider);
    await persistUser(credential.user);
    return { ok: true };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      await signInWithRedirect(getFirebaseAuth(), googleProvider);
      return { ok: true, message: "Redirecting to Google…" };
    }
    return { ok: false, message: firebaseMessage(error) };
  }
}

export async function completeGoogleRedirect(): Promise<AuthResult | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const result = await getRedirectResult(getFirebaseAuth());
    if (!result?.user) return null;
    await persistUser(result.user);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: firebaseMessage(error) };
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email);
    return { ok: true, message: "If the account exists, a reset email has been sent." };
  } catch (error) {
    return { ok: false, message: firebaseMessage(error) };
  }
}

export async function syncAuthSession(): Promise<AuthSession | null> {
  if (!isFirebaseConfigured()) return getAuthSession();
  const user = getFirebaseAuth().currentUser;
  if (!user) return getAuthSession();
  return persistUser(user);
}

export async function validateAndStoreApiToken(value: string): Promise<AuthResult> {
  try {
    const res = await fetch(`${getApiUrl()}/api/healthz`, {
      method: "GET",
      headers: { Authorization: `Bearer ${value}` },
    });
    if (!res.ok) {
      return { ok: false, message: "Unable to verify token. Check your API URL or token." };
    }
    localStorage.setItem(API_TOKEN_KEY, value);
    return { ok: true, message: "API token saved successfully." };
  } catch {
    return { ok: false, message: "Unable to verify token. Check your API URL or token." };
  }
}

export function clearStoredApiToken() {
  localStorage.removeItem(API_TOKEN_KEY);
}

export { isFirebaseConfigured };
