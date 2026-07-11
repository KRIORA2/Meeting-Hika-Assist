import { useState } from "react";
import { Link } from "wouter";
import {
  useListSessions,
  useDeleteSession,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trash2,
  ChevronRight,
  History,
  Video,
  Users,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PLATFORM_LABELS: Record<string, string> = {
  zoom: "Zoom",
  teams: "Microsoft Teams",
  meet: "Google Meet",
  other: "Other",
};

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  zoom: Video,
  teams: Users,
  meet: Globe,
  other: Globe,
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(start: string, end: string | null) {
  if (!end) return "Ongoing";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Sessions() {
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const deleteSession = useDeleteSession();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    deleteSession.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setDeletingId(null);
        },
        onError: () => setDeletingId(null),
      }
    );
  };

  return (
    <div className="h-full flex flex-col p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          History of all your AI-assisted meetings
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground py-20">
          <History size={36} className="mb-4 opacity-30" />
          <p className="font-medium">No sessions yet</p>
          <p className="text-sm mt-1">Start a meeting assistant session to see it here</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {sessions.map((session, i) => {
              const PlatformIcon = PLATFORM_ICONS[session.platform] ?? Globe;
              return (
                <div
                  key={session.id}
                  className="group bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:border-border/80 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-200"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <PlatformIcon size={18} className="text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{session.title}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs flex-shrink-0",
                          session.status === "active"
                            ? "border-primary/40 text-primary"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {session.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{PLATFORM_LABELS[session.platform] ?? session.platform}</span>
                      <span>&middot;</span>
                      <span>{formatDate(session.createdAt)}</span>
                      <span>&middot;</span>
                      <span>{duration(session.createdAt, session.endedAt ?? null)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">{session.insightCount}</p>
                      <p className="text-xs text-muted-foreground">insights</p>
                    </div>

                    <button
                      onClick={() => handleDelete(session.id)}
                      disabled={deletingId === session.id}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1.5 rounded hover:bg-destructive/10"
                    >
                      <Trash2 size={15} />
                    </button>

                    <Link href={`/session/${session.id}`}>
                      <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted">
                        <ChevronRight size={18} />
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
