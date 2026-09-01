import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { getStoredSessionToken, isAuthenticated, syncAuthSession } from "@/lib/auth";
import Shell from "@/components/layout/Shell";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Install from "@/pages/Install";
import Dashboard from "@/pages/Dashboard";
import MeetingAssistant from "@/pages/MeetingAssistant";
import History from "@/pages/History";
import SessionDetail from "@/pages/SessionDetail";
import Documents from "@/pages/Documents";
import Settings from "@/pages/Settings";
import StealthOverlay from "@/pages/StealthOverlay";
import NotFound from "@/pages/not-found";

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
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public landing page — no shell */}
      <Route path="/login" component={Login} />
      <Route path="/install" component={Install} />
      <Route path="/" component={HomeRoute} />

      {/* Stealth popup — no shell */}
      <Route path="/stealth" component={StealthOverlay} />

      {/* Main app with sidebar shell */}
      <Route component={ProtectedShell} />
    </Switch>
  );
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
    setBaseUrl(apiUrl);
    setAuthTokenGetter(() => getStoredSessionToken());
    void syncAuthSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
