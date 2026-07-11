import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { History as HistoryIcon, Search, Zap, ArrowRight, Clock, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const platformLabel: Record<string, string> = {
  teams: "Teams",
  zoom: "Zoom",
  meet: "Meet",
  other: "Other",
};

const platformIcon: Record<string, string> = {
  teams: "🟦",
  zoom: "🔵",
  meet: "🟢",
  other: "⚪",
};

function formatDuration(createdAt: string, endedAt?: string | null) {
  const start = new Date(createdAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const mins = Math.round((end - start) / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const { data: sessions = [], isLoading } = useListSessions({
    query: { queryKey: getListSessionsQueryKey() },
  });

  const filtered = sessions.filter((s) => {
    const matchesSearch =
      !search || s.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && s.status === "active") ||
      (filter === "ended" && s.status === "ended") ||
      s.platform === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Session History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and review all past meeting sessions
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions…"
              className="w-full bg-card border border-card-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-1 bg-card border border-card-border rounded-lg p-1">
            {[
              { id: "all", label: "All" },
              { id: "teams", label: "Teams" },
              { id: "zoom", label: "Zoom" },
              { id: "meet", label: "Meet" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-md transition-colors",
                  filter === f.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sessions list */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl h-16 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-card-border rounded-xl p-16 text-center">
            <HistoryIcon size={32} className="mx-auto mb-4 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {search ? "No sessions match your search" : "No sessions yet"}
            </p>
            {!search && (
              <Link href="/session" className="text-xs text-primary mt-2 inline-block hover:underline">
                Start your first session →
              </Link>
            )}
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-2">
              {filtered.map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                >
                  <Link href={`/history/${session.id}`}>
                    <div className="group bg-card border border-card-border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-primary/30 hover:bg-primary/[0.02] transition-all cursor-pointer">
                      <div className="text-xl flex-shrink-0 select-none">
                        {platformIcon[session.platform ?? "other"] ?? "⚪"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium truncate">{session.title}</p>
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded flex-shrink-0">
                            {platformLabel[session.platform ?? "other"] ?? "Other"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {formatDuration(session.createdAt, session.endedAt)}
                          </span>
                          <span>{formatDate(session.createdAt)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {(session.insightCount ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-primary/8 text-primary rounded-md px-2.5 py-1">
                            <Zap size={10} />
                            {session.insightCount} insight{session.insightCount !== 1 ? "s" : ""}
                          </div>
                        )}
                        <div
                          className={cn(
                            "text-[10px] font-medium px-2 py-0.5 rounded-full",
                            session.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {session.status === "active" ? "● Live" : "Ended"}
                        </div>
                        <ArrowRight size={13} className="text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
