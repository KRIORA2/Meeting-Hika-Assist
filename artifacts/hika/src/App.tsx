import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect, useState } from "react";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { getAccessToken, isAuthenticated, subscribeAuth } from "@/lib/auth";
import Shell from "@/components/layout/Shell";
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Install = lazy(() => import("@/pages/Install"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MeetingAssistant = lazy(() => import("@/pages/MeetingAssistant"));
const History = lazy(() => import("@/pages/History"));
const SessionDetail = lazy(() => import("@/pages/SessionDetail"));
const Documents = lazy(() => import("@/pages/Documents"));
const Settings = lazy(() => import("@/pages/Settings"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const DesktopConnect = lazy(() => import("@/pages/DesktopConnect"));
const StealthOverlay = lazy(() => import("@/pages/StealthOverlay"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

function AppRedirect({ to }: { to: string }) {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate(to);
  }, [navigate, to]);

  return null;
}

function HomeRoute() {
  return <Landing />;
}

function ProtectedShell() {
  const [location] = useLocation();

  if (!isAuthenticated()) {
    return <AppRedirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  return (
    <Shell>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/session" component={MeetingAssistant} />
        <Route path="/history" component={History} />
        <Route path="/history/:id" component={SessionDetail} />
        <Route path="/documents" component={Documents} />
        <Route path="/settings" component={Settings} />
        <Route path="/pricing" component={Pricing} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function ProtectedInstall() {
  if (!isAuthenticated()) {
    return <AppRedirect to="/login?next=%2Finstall" />;
  }
  return <Install />;
}

function Router() {
  return (
    <Switch>
      {/* Public landing page — no shell */}
      <Route path="/login" component={Login} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/desktop-connect" component={DesktopConnect} />
      <Route path="/install" component={ProtectedInstall} />
      <Route path="/" component={HomeRoute} />

      {/* Stealth popup — no shell */}
      <Route path="/stealth" component={StealthOverlay} />

      {/* Main app with sidebar shell */}
      <Route component={ProtectedShell} />
    </Switch>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
    setBaseUrl(apiUrl);
    setAuthTokenGetter(() => getAccessToken());
    return subscribeAuth(() => setAuthReady(true));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Suspense fallback={<div className="min-h-screen bg-[#07070f]" aria-label="Loading Hikanest" />}>
            {authReady ? <Router /> : <div className="min-h-screen bg-[#07070f]" aria-label="Loading Hikanest" />}
          </Suspense>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
