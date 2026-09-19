import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, Sparkles } from "lucide-react";
import { getAccessToken, isAuthenticated, subscribeAuth } from "@/lib/auth";

type Account = {
  email: string;
  plan: "free" | "pro";
  credits: number;
  creditsResetAt: string;
  billingConfigured: boolean;
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const PRO_MONTHLY_USD = 13;
const PRO_YEARLY_USD = PRO_MONTHLY_USD * 10;

export default function Pricing() {
  const [, navigate] = useLocation();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [account, setAccount] = useState<Account | null>(null);
  const [billingLive, setBillingLive] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"session" | "pro" | "">("");
  const signedIn = isAuthenticated();

  const search = typeof window !== "undefined" ? window.location.search : "";
  const checkoutNote = useMemo(() => {
    if (search.includes("success=1")) return "Payment received. Credits will appear in a few seconds.";
    if (search.includes("canceled=1")) return "Checkout was canceled. You can try again whenever you're ready.";
    return "";
  }, [search]);

  useEffect(() => {
    void fetch(`${API_URL}/api/billing/plans`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { configured?: boolean } | null) => {
        if (payload && typeof payload.configured === "boolean") setBillingLive(payload.configured);
      })
      .catch(() => undefined);
    void loadAccount();
    return subscribeAuth(() => {
      void loadAccount();
    });
  }, []);

  async function loadAccount() {
    const token = await getAccessToken();
    if (!token) {
      setAccount(null);
      return;
    }
    const response = await fetch(`${API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    setAccount(await response.json() as Account);
  }

  async function startCheckout(plan: "session" | "pro") {
    if (!signedIn) {
      navigate("/login?next=%2Fpricing");
      return;
    }
    setBusy(plan);
    setStatus("");
    try {
      const token = await getAccessToken();
      const response = await fetch(`${API_URL}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan, interval }),
      });
      const result = await response.json() as { checkoutUrl?: string; error?: string };
      if (!response.ok || !result.checkoutUrl) {
        setStatus(result.error || (billingLive ? "Could not start checkout." : "Checkout is not live yet. Add Stripe keys on the API to enable payments."));
        return;
      }
      window.location.assign(result.checkoutUrl);
    } catch {
      setStatus("Could not start checkout. Try again in a moment.");
    } finally {
      setBusy("");
    }
  }

  const isPro = account?.plan === "pro";
  const proPrice = interval === "year" ? `$${PRO_YEARLY_USD}` : `$${PRO_MONTHLY_USD}`;
  const proCadence = interval === "year" ? "per year · 2 months free" : "per month";

  return (
    <div className="min-h-screen bg-[#07070f] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src="/icons/icon.png" alt="" className="w-8 h-8 rounded-xl" />
            <span className="font-semibold">Hikanest</span>
          </button>
          <button onClick={() => navigate(signedIn ? "/settings" : "/login")} className="text-sm text-white/60 hover:text-white">
            {signedIn ? "Settings" : "Sign in"}
          </button>
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300 mb-3">Plans</p>
        <h1 className="text-4xl font-extrabold tracking-tight">Choose how you work</h1>
        <p className="text-white/55 mt-3 max-w-2xl">
          Pay per session when you need one meeting, or subscribe monthly. Yearly is 10 months billed up front.
          Answers stay on screen — resume and JD are read as text, never spoken.
        </p>

        <div className="mt-8 inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
          <button
            className={`px-4 py-1.5 text-sm rounded-full ${interval === "month" ? "bg-white/10 text-white" : "text-white/50"}`}
            onClick={() => setInterval("month")}
          >
            Monthly
          </button>
          <button
            className={`px-4 py-1.5 text-sm rounded-full ${interval === "year" ? "bg-white/10 text-white" : "text-white/50"}`}
            onClick={() => setInterval("year")}
          >
            Yearly <span className="ml-1 text-[10px] uppercase tracking-wider text-cyan-300">Save 2 months</span>
          </button>
        </div>

        {(checkoutNote || status) && (
          <p className="mt-6 text-sm text-cyan-200/90">{status || checkoutNote}</p>
        )}

        {account && (
          <p className="mt-4 text-sm text-white/50">
            Current plan <strong className="text-white">{account.plan}</strong> · {account.credits} credits remaining
          </p>
        )}

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
            <p className="text-sm text-white/50">Free</p>
            <p className="text-4xl font-extrabold mt-2">$0</p>
            <p className="text-sm text-white/45 mt-1">Try the product · 50 credits / month</p>
            <ul className="mt-6 space-y-3 text-sm text-white/70">
              {["Sign in and dashboard", "A few short sessions to start", "Live transcript", "On-screen answers"].map((item) => (
                <li key={item} className="flex gap-2"><CheckCircle size={16} className="text-emerald-400 mt-0.5" />{item}</li>
              ))}
            </ul>
            <button disabled className="mt-8 w-full rounded-xl border border-white/10 py-2.5 text-sm text-white/40">
              {account?.plan === "free" ? "Current plan" : "Included"}
            </button>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/[0.04] p-7">
            <p className="text-sm text-white/70">Per session</p>
            <p className="text-4xl font-extrabold mt-2">₹199</p>
            <p className="text-sm text-white/45 mt-1">One meeting · 20 credits</p>
            <ul className="mt-6 space-y-3 text-sm text-white/75">
              {[
                "Pay only when you need a session",
                "Enough credits for one live meeting",
                "GPT-4.1 answers on screen",
                "Resume and JD read automatically",
              ].map((item) => (
                <li key={item} className="flex gap-2"><CheckCircle size={16} className="text-amber-300 mt-0.5" />{item}</li>
              ))}
            </ul>
            <button
              onClick={() => void startCheckout("session")}
              disabled={Boolean(busy) || !billingLive}
              className="mt-8 w-full rounded-xl border border-white/20 bg-white/10 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {billingLive ? (busy === "session" ? "Opening checkout…" : "Buy one session") : "Checkout not live yet"}
            </button>
          </div>

          <div className="rounded-3xl border border-cyan-400/30 bg-gradient-to-b from-[#6c63ff]/16 to-transparent p-7 shadow-[0_0_40px_rgba(108,99,255,0.18)]">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/80">Pro</p>
              <span className="text-[10px] uppercase tracking-wider rounded-full border border-cyan-300/30 px-2 py-0.5 text-cyan-200">Most used</span>
            </div>
            <p className="text-4xl font-extrabold mt-2">{proPrice}</p>
            <p className="text-sm text-white/45 mt-1">{proCadence} · 500 credits / month</p>
            <ul className="mt-6 space-y-3 text-sm text-white/80">
              {[
                "Desktop overlay during real meetings",
                "GPT-4.1 answers on screen",
                "Reads resume and JD automatically",
                "Documents and history",
                "500 credits each month",
              ].map((item) => (
                <li key={item} className="flex gap-2"><CheckCircle size={16} className="text-cyan-300 mt-0.5" />{item}</li>
              ))}
            </ul>
            <button
              onClick={() => void startCheckout("pro")}
              disabled={Boolean(busy) || isPro || !billingLive}
              className="mt-8 w-full rounded-xl py-2.5 text-sm font-semibold text-[#071529] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #7486ff, #3be2ff)" }}
            >
              {isPro ? "You're on Pro" : !billingLive ? "Checkout not live yet" : busy === "pro" ? "Opening checkout…" : `Upgrade ${interval === "year" ? "yearly" : "monthly"}`}
            </button>
          </div>
        </div>

        <p className="mt-8 text-xs text-white/35 flex items-center gap-2">
          <Sparkles size={12} /> {billingLive ? "Pay on the website. The desktop app never asks for a card." : "Checkout turns on when Stripe keys are set on the API."} Yearly Pro is ${PRO_YEARLY_USD} ({PRO_MONTHLY_USD} × 10 months).
        </p>
      </div>
    </div>
  );
}
