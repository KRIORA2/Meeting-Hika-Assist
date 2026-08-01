export type AuthSession = {
  email: string;
  provider: "password" | "google";
  signedInAt: string;
  expiresAt: string;
};

type AuthResponse = {
  token: string;
  session: AuthSession;
};

type AuthResult = {
  ok: boolean;
  message?: string;
  resetToken?: string;
};

const SESSION_KEY = "hikaAuthSession";
const SESSION_TOKEN_KEY = "hikaSessionToken";
const API_TOKEN_KEY = "hikaApiToken";

function getApiUrl() {
  return import.meta.env.VITE_API_URL || "http://localhost:5000";
}

function isSessionExpired(session: AuthSession | null) {
  if (!session?.expiresAt) return true;
  return new Date(session.expiresAt).getTime() <= Date.now();
}

function storeAuthPayload(payload: AuthResponse) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload.session));
  localStorage.setItem(SESSION_TOKEN_KEY, payload.token);
}

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.email || isSessionExpired(parsed)) {
      clearAuthState();
      return null;
    }
    return parsed;
  } catch {
    clearAuthState();
    return null;
  }
}

export function getStoredSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getStoredApiToken(): string | null {
  return localStorage.getItem(API_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAuthSession() && !!getStoredSessionToken();
}

export function clearAuthState() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function signOut(): Promise<void> {
  const token = getStoredSessionToken();
  try {
    if (token) {
      await fetch(`${getApiUrl()}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
  } finally {
    clearAuthState();
  }
}

async function parseApiMessage(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
    if (typeof body?.message === "string") return body.message;
  } catch {
  }
  return undefined;
}

async function authPost(path: string, body: Record<string, unknown>): Promise<AuthResult> {
  const response = await fetch(`${getApiUrl()}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { ok: false, message: (await parseApiMessage(response)) || "Authentication failed." };
  }

  const payload = (await response.json()) as AuthResponse;
  storeAuthPayload(payload);
  return { ok: true };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  return authPost("/auth/login", { email, password });
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  return authPost("/auth/signup", { email, password });
}

export async function signInWithGoogleIdToken(idToken: string): Promise<AuthResult> {
  return authPost("/auth/google", { idToken });
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const response = await fetch(`${getApiUrl()}/api/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, message: body?.error || body?.message || "Failed to request password reset." };
  }
  return { ok: true, message: body?.message || "Password reset requested.", resetToken: body?.resetToken };
}

export async function confirmPasswordReset(token: string, password: string): Promise<AuthResult> {
  const response = await fetch(`${getApiUrl()}/api/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, message: body?.error || body?.message || "Failed to reset password." };
  }
  return { ok: true, message: body?.message || "Password updated successfully." };
}

export async function syncAuthSession(): Promise<AuthSession | null> {
  const token = getStoredSessionToken();
  if (!token) return null;

  try {
    const response = await fetch(`${getApiUrl()}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      clearAuthState();
      return null;
    }
    const body = (await response.json()) as { session: AuthSession };
    localStorage.setItem(SESSION_KEY, JSON.stringify(body.session));
    return body.session;
  } catch {
    return getAuthSession();
  }
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
