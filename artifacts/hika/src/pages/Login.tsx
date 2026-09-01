import { useEffect, useState, type FormEvent } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import {
  getAuthSession,
  signInWithGoogleIdToken,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth";

type Mode = "signin" | "signup";

export default function Login() {
  const [, navigate] = useLocation();

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const canUseGoogleLogin = Boolean(googleClientId);
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

  function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/";
  }

  function validEmail(value: string) {
    return /.+@.+\..+/.test(value);
  }

  async function handleAuthSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!validEmail(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }
    if (mode === "signup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    const result = mode === "signin"
      ? await signInWithPassword(email.trim(), password)
      : await signUpWithPassword(email.trim(), password);
    setIsLoading(false);

    if (!result.ok) {
      setError(result.message || "Authentication failed.");
      return;
    }
    navigate(getNextUrl());
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(108,99,255,0.22),_transparent_28%),linear-gradient(135deg,_#06070e_0%,_#090b16_100%)] text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-[rgba(10,11,20,0.88)] shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl p-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <button onClick={() => navigate("/")} className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <ArrowLeft size={16} /> Back to home
          </button>
        </div>

        <div className="flex items-center justify-center mb-6 gap-3">
          <img src="/icons/icon.png" alt="Hikanest" className="w-12 h-12 rounded-2xl object-cover shadow-[0_0_30px_rgba(99,102,241,0.3)]" />
          <div>
            <h1 className="text-3xl font-semibold">Welcome to Hikanest</h1>
            <p className="text-sm text-white/60 mt-1">Sign in to continue your private AI meeting workspace.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4 rounded-2xl border border-white/10 p-1 bg-white/5">
          {(["signin", "signup"] as Mode[]).map((value) => (
            <button key={value} type="button" onClick={() => { setMode(value); setError(null); }} className={`rounded-xl py-2 text-sm font-semibold transition ${mode === value ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}>
              {value === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-white/70">User Email</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Enter your account email" className="w-full rounded-2xl border border-white/10 bg-[#111827]/90 px-4 py-3 text-sm text-white outline-none transition focus:border-[#6366f1] focus:ring focus:ring-[#6366f12f]" />

          <label className="block text-sm font-medium text-white/70">Password</label>
          <div className="relative">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              className="w-full rounded-2xl border border-white/10 bg-[#111827]/90 px-4 py-3 pr-12 text-sm text-white outline-none transition focus:border-[#6366f1] focus:ring focus:ring-[#6366f12f]"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {mode === "signup" && (
            <>
              <label className="block text-sm font-medium text-white/70">Confirm Password</label>
              <div className="relative">
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  className="w-full rounded-2xl border border-white/10 bg-[#111827]/90 px-4 py-3 pr-12 text-sm text-white outline-none transition focus:border-[#6366f1] focus:ring focus:ring-[#6366f12f]"
                />

                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </>
          )}

          <button type="submit" disabled={isLoading} className="w-full rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
            {isLoading ? "Please wait..." : mode === "signin" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        {canUseGoogleLogin && (
          <>
            <div className="divider my-6">
              <span>or</span>
            </div>

            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  try {
                    setIsLoading(true);
                    setError(null);

                    const result = await signInWithGoogleIdToken(credentialResponse.credential!);

                    if (!result.ok) {
                      throw new Error(result.message);
                    }

                    navigate(getNextUrl());
                  } catch (err: any) {
                    setError(err.message || "Google login failed.");
                  } finally {
                    setIsLoading(false);
                  }
                }}
                onError={() => {
                  setError("Google Sign-In failed.");
                }}
              />
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
