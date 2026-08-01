import { Link } from "wouter";
import { motion } from "framer-motion";
import { useGetStats, useListSessions, getGetStatsQueryKey, getListSessionsQueryKey } from "@workspace/api-client-react";
import {
  Zap, Radio, TrendingUp, Clock, Plus, ArrowRight,
  CheckCircle2, Circle, Mic, Monitor, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35 } }),
};

export default function Dashboard() {
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });
  const { data: sessions } = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });

  const recent = sessions?.slice(0, 6) ?? [];

  const statCards = [
    {
      label: "Total Sessions",
      value: stats?.totalSessions ?? 0,
      icon: Radio,
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      label: "AI Insights",
      value: stats?.totalInsights ?? 0,
      icon: Zap,
      color: "text-violet-400",
      bg: "bg-violet-500/8",
    },
    {
      label: "Active Now",
      value: stats?.activeSessions ?? 0,
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/8",
    },
    {
      label: "Avg. Insights",
      value: stats?.avgInsightsPerSession?.toFixed(1) ?? "0",
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/8",
    },
  ];

  const knowledgeSources = [
    { name: "Microsoft Teams", connected: false, icon: "🟦" },
    { name: "Google Drive", connected: false, icon: "🟢" },
    { name: "Confluence", connected: false, icon: "🔵" },
    { name: "Notion", connected: false, icon: "⬛" },
    { name: "GitHub", connected: false, icon: "⚫" },
    { name: "Jira", connected: false, icon: "🔷" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6c63ff]/30 bg-[#6c63ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#c8b9ff] mb-4">
            <Zap size={12} /> Premium AI workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {greeting()}{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #6c63ff, #00e5ff)" }}
            >
              — ready when you are.
            </span>
          </h1>
          <p className="text-white/55 text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {" · "}Hikanest is listening
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {statCards.map((card: any, i: number) => (
            <motion.div
              key={card.label}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="bg-card border border-card-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", card.bg)}>
                  <card.icon size={14} className={card.color} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight">{card.value}</div>
            </motion.div>
          ))}
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-3 gap-6">
          {/* Recent sessions */}
          <div className="col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Sessions
              </h2>
              <Link href="/history" className="text-xs text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="bg-card border border-card-border rounded-xl p-10 text-center">
                <Radio size={28} className="mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No sessions yet — start your first one!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((session: any, i: number) => (
                  <motion.div
                    key={session.id}
                    custom={i + 4}
                    variants={fadeUp}
                    initial="hidden"
                    animate="show"
                  >
                    <Link href={`/history/${session.id}`}>
                      <div className="group rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center gap-4 hover:border-[#6c63ff]/35 hover:bg-[#6c63ff]/10 transition-all cursor-pointer backdrop-blur-xl">
                        <div className="text-lg flex-shrink-0 select-none">
                          {platformIcon[session.platform ?? "other"] ?? "⚪"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{session.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDuration(session.createdAt, session.endedAt)}
                            {" · "}
                            {timeAgo(session.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {(session.insightCount ?? 0) > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-md px-2 py-1">
                              <Zap size={10} className="text-primary" />
                              {session.insightCount}
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
                          <ArrowRight size={13} className="text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Start session CTA */}
            <motion.div
              custom={4}
              variants={fadeUp}
              initial="hidden"
              animate="show"
            >
              <Link href="/session">
                <div
                  className="relative rounded-2xl p-5 cursor-pointer overflow-hidden group border border-[#6c63ff]/25"
                  style={{
                    background: "linear-gradient(135deg, rgba(108,99,255,0.18), rgba(0,229,255,0.12))",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start justify-between mb-4 relative">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))" }}
                    >
                      <Plus size={16} className="text-white" />
                    </div>
                    <ArrowRight size={14} className="text-primary/50 group-hover:text-primary transition-colors mt-1" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1 relative">Start New Session</h3>
                  <p className="text-xs text-muted-foreground relative leading-relaxed">
                    Connect your mic, share your screen, and get real-time AI answers.
                  </p>
                  <div className="flex items-center gap-3 mt-4 relative">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Mic size={11} className="text-primary" /> Mic
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Monitor size={11} className="text-primary" /> Screen
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Zap size={11} className="text-primary" /> Stealth
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* AI Status */}
            <motion.div
              custom={5}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="bg-card border border-card-border rounded-xl p-4"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                AI Status
              </h3>
              <div className="space-y-2.5">
                {[
                  { label: "Transcription", status: "online", model: "GPT-4.1 / GPT-4o Transcribe" },
                  { label: "Analysis", status: "online", model: "GPT-4.1" },
                  { label: "Knowledge Base", status: "offline", model: "—" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    {item.status === "online" ? (
                      <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                    ) : (
                      <Circle size={13} className="text-muted-foreground/30 flex-shrink-0" />
                    )}
                    <span className="text-xs flex-1">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{item.model}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Knowledge sources */}
            <motion.div
              custom={6}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="bg-card border border-card-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Knowledge Sources
                </h3>
                <Link href="/documents" className="text-[10px] text-primary hover:underline">
                  Connect
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {knowledgeSources.map((src) => (
                  <div
                    key={src.name}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/40 opacity-40 cursor-not-allowed"
                    title={src.name}
                  >
                    <span className="text-base">{src.icon}</span>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center">{src.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
                <Brain size={10} />
                <span>0 of 6 sources connected</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
