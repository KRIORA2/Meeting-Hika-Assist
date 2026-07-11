import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import Shell from "@/components/layout/Shell";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import MeetingAssistant from "@/pages/MeetingAssistant";
import History from "@/pages/History";
import SessionDetail from "@/pages/SessionDetail";
import Documents from "@/pages/Documents";
import Settings from "@/pages/Settings";
import StealthOverlay from "@/pages/StealthOverlay";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Public landing page — no shell */}
      <Route path="/" component={Landing} />

      {/* Stealth popup — no shell */}
      <Route path="/stealth" component={StealthOverlay} />

      {/* Main app with sidebar shell */}
      <Route>
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
      </Route>
    </Switch>
  );
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
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
