import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  getAuthSession,
  isFirebaseConfigured,
  completeGoogleRedirect,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth";

type Mode = "signin" | "signup";

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

export default function Login() {
  const [, navigate] = useLocation();

  const firebaseReady = isFirebaseConfigured();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const session = getAuthSession();
    if (session) {
      navigate(getNextUrl());
    }
  }, [navigate]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") {
      setMode("signup");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function finishGoogle() {
      const redirected = await completeGoogleRedirect();
      if (cancelled) return;
      if (redirected?.ok) {
        navigate(getNextUrl());
        return;
      }
      if (redirected && !redirected.ok) {
        setError(redirected.message || "Google sign-in failed.");
        return;
      }
      if (new URLSearchParams(window.location.search).get("provider") === "google") {
        await handleGoogleSignIn();
      }
    }
    void finishGoogle();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  function validEmail(value: string) {
    return /.+@.+\..+/.test(value);
  }

  async function handleAuthSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!firebaseReady) {
      setError("Firebase is not configured. Add the VITE_FIREBASE_* keys to your web environment.");
      return;
    }
    if (!validEmail(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }
    if (mode === "signup") {
      if (password.length < 12) {
        setError("Use at least 12 characters for your password.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = mode === "signin"
        ? await signInWithPassword(email.trim(), password)
        : await signUpWithPassword(email.trim(), password);
      if (!result.ok) {
        setError(result.message || "Authentication failed.");
        return;
      }
      navigate(getNextUrl());
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!firebaseReady) {
      setError("Enable Google in Firebase Authentication and add the VITE_FIREBASE_* keys, then restart the web app.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await signInWithGoogle();
    setIsLoading(false);
    if (!result.ok) {
      setError(result.message || "Google sign-in failed.");
      return;
    }
    if (!result.message) navigate(getNextUrl());
  }

  const strength = passwordStrength(password);
  const strengthLabel = ["Too short", "Basic", "Good", "Strong", "Excellent"][strength];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#060711] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(99,102,241,0.22),transparent_30%),radial-gradient(circle_at_88%_82%,rgba(6,182,212,0.13),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between border-r border-white/[0.07] px-12 py-10 lg:flex xl:px-20">
          <button onClick={() => navigate("/")} className="inline-flex w-fit items-center gap-2 text-sm text-white/60 transition hover:text-white">
            <ArrowLeft size={16} /> Back to Hikanest
          </button>
          <div className="max-w-xl">
            <div className="mb-8 flex items-center gap-3">
              <img src="/icons/icon.png" alt="" className="h-12 w-12 rounded-2xl object-cover shadow-[0_0_34px_rgba(99,102,241,0.34)]" />
              <span className="text-xl font-semibold tracking-tight">Hikanest</span>
            </div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-200">
              <Sparkles size={13} /> AI assistance for every conversation
            </p>
            <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.035em]">
              Turn live conversations into clear, confident action.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/55">
              Get private realtime guidance, searchable transcripts, and context-aware answers in one focused workspace.
            </p>
            <div className="mt-9 grid gap-4 text-sm text-white/70">
              {["Encrypted account sessions", "Private desktop authentication", "Your meeting data stays account-scoped"].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check size={14} /></span>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-white/35"><ShieldCheck size={14} /> Secure access powered by short-lived browser-to-desktop handoff codes.</p>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[460px]">
            <button onClick={() => navigate("/")} className="mb-8 inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white lg:hidden">
              <ArrowLeft size={16} /> Back to home
            </button>
            <div className="mb-8">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <img src="/icons/icon.png" alt="" className="h-11 w-11 rounded-2xl object-cover" />
                <span className="text-lg font-semibold">Hikanest</span>
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.025em]">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/50">
                {mode === "signin" ? "Sign in to continue to your workspace." : "Start using your private AI meeting workspace."}
              </p>
            </div>

            {!firebaseReady && (
              <div role="status" className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-3.5 py-3 text-sm text-amber-100">
                Firebase is not configured yet. Add the VITE_FIREBASE_* keys, enable Email/Password and Google in Firebase Authentication, then restart the web app.
              </div>
            )}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1">
              {(["signin", "signup"] as Mode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition ${mode === value ? "bg-white/10 text-white shadow-sm" : "text-white/45 hover:text-white/75"}`}
                >
                  {value === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => { void handleGoogleSignIn(); }}
              className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-slate-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.6 7.4l6.3 5.2C37.4 38.3 44 33 44 24c0-1.2-.1-2.3-.4-3.5z"/>
              </svg>
              Continue with Google
            </button>
            <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-white/25">
              <span className="h-px flex-1 bg-white/10" />or use email<span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-white/75">Email address</label>
                <div className="relative">
                  <Mail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" inputMode="email" autoComplete="email" required placeholder="you@company.com" className="w-full rounded-xl border border-white/10 bg-white/[0.045] py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-indigo-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-indigo-500/10" />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-white/75">Password</label>
                <div className="relative">
                  <LockKeyhole size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input id="password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 12 : 1} placeholder={mode === "signup" ? "At least 12 characters" : "Enter your password"} className="w-full rounded-xl border border-white/10 bg-white/[0.045] py-3.5 pl-11 pr-12 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-indigo-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-indigo-500/10" />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 transition hover:text-white">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {mode === "signup" && password && (
                  <div className="mt-2.5" aria-live="polite">
                    <div className="mb-1.5 flex gap-1.5">{[1, 2, 3, 4].map((step) => <span key={step} className={`h-1 flex-1 rounded-full ${strength >= step ? (strength >= 3 ? "bg-emerald-400" : "bg-amber-400") : "bg-white/10"}`} />)}</div>
                    <p className="text-xs text-white/40">{strengthLabel} · Prefer a unique passphrase.</p>
                  </div>
                )}
              </div>

              {mode === "signup" && (
                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-white/75">Confirm password</label>
                  <div className="relative">
                    <LockKeyhole size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input id="confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} placeholder="Enter your password again" className="w-full rounded-xl border border-white/10 bg-white/[0.045] py-3.5 pl-11 pr-12 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-indigo-400/60 focus:ring-4 focus:ring-indigo-500/10" />
                    <button type="button" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 transition hover:text-white">
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-sm text-rose-200">{error}</div>}

              <button type="submit" disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(99,102,241,0.25)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
                {isLoading && <LoaderCircle size={17} className="animate-spin" />}
                {isLoading ? "Authenticating…" : mode === "signin" ? "Sign in securely" : "Create secure account"}
              </button>
            </form>

            <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs leading-5 text-white/35">
              <ShieldCheck size={14} /> Protected by Firebase Authentication and encrypted ID tokens.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
