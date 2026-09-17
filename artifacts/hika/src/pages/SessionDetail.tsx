import { Link, useParams } from "wouter";
import {
	useGetSession,
	useListSessionInsights,
	getGetSessionQueryKey,
	getListSessionInsightsQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import InsightAnswer from "@/components/InsightAnswer";
import {
	ChevronLeft,
	Lightbulb,
	Video,
	Users,
	Globe,
	Clock,
	Zap,
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
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "long",
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
	if (mins < 1) return "< 1m";
	if (mins < 60) return `${mins}m`;
	return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function SessionDetail() {
	const params = useParams<{ id: string }>();
	const id = Number(params.id);

	const { data: session, isLoading: sessionLoading } = useGetSession(id, {
		query: { enabled: !!id, queryKey: getGetSessionQueryKey(id) },
	});

	const { data: insights, isLoading: insightsLoading } = useListSessionInsights(id, {
		query: { enabled: !!id, queryKey: getListSessionInsightsQueryKey(id) },
	});

	const isLoading = sessionLoading || insightsLoading;

	if (isLoading) {
		return (
			<div className="p-6 max-w-3xl mx-auto space-y-4">
				<div className="h-8 w-32 bg-card border border-border rounded animate-pulse" />
				<div className="h-24 bg-card border border-border rounded-lg animate-pulse" />
				<div className="space-y-3">
					{[...Array(3)].map((_, i) => (
						<div key={i} className="h-32 bg-card border border-border rounded-lg animate-pulse" />
					))}
				</div>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="p-6 flex flex-col items-center justify-center min-h-full text-muted-foreground">
				<p>Session not found.</p>
				<Link href="/history">
					<button className="mt-3 text-sm text-primary hover:underline">Back to sessions</button>
				</Link>
			</div>
		);
	}

	const PlatformIcon = PLATFORM_ICONS[session.platform] ?? Globe;

	return (
		<div className="h-full flex flex-col p-6 max-w-3xl mx-auto">
			{/* Back */}
			<Link href="/history">
				<button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5 group">
					<ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
					Sessions
				</button>
			</Link>

			{/* Session header */}
			<div className="bg-card border border-border rounded-lg p-5 mb-5">
				<div className="flex items-start gap-4">
					<div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
						<PlatformIcon size={22} className="text-primary" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h1 className="text-lg font-semibold">{session.title}</h1>
							<Badge
								variant="outline"
								className={cn(
									"text-xs",
									session.status === "active"
										? "border-primary/40 text-primary"
										: "border-border text-muted-foreground"
								)}
							>
								{session.status}
							</Badge>
						</div>
						<p className="text-sm text-muted-foreground mt-0.5">
							{PLATFORM_LABELS[session.platform] ?? session.platform}
						</p>
					</div>
					<div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
						<div className="text-center">
							<p className="text-xl font-bold text-primary">{session.insightCount}</p>
							<p className="text-xs">insights</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<Clock size={12} />
						{formatDate(session.createdAt)}
					</span>
					<span className="flex items-center gap-1.5">
						<Zap size={12} />
						Duration: {duration(session.createdAt, session.endedAt ?? null)}
					</span>
				</div>
			</div>

			{/* Insights */}
			<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
				Insights Timeline
			</h2>

			{!insights || insights.length === 0 ? (
				<div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16">
					<Lightbulb size={32} className="mb-3 opacity-30" />
					<p className="text-sm">No insights recorded for this session</p>
				</div>
			) : (
				<ScrollArea className="flex-1">
					<div className="space-y-3 pr-2">
						{insights.map((insight: any, i: number) => (
							<div
								key={insight.id}
								className="bg-card border border-border rounded-lg p-4 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200"
								style={{ animationDelay: `${i * 50}ms` }}
							>
								<div className="flex items-start gap-3">
									<Lightbulb size={15} className="text-primary mt-0.5 flex-shrink-0" />
									<div className="flex-1 min-w-0">
										<p className="text-xs text-muted-foreground font-mono mb-1.5">
											{insight.question}
										</p>
										<InsightAnswer
											answer={insight.answer}
											sections={insight.sections}
										/>
									</div>
								</div>

								<Separator />

								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<Badge
										variant="outline"
										className={cn(
											"text-xs",
											insight.confidence === "high"
												? "border-primary/40 text-primary"
												: insight.confidence === "medium"
												? "border-yellow-500/40 text-yellow-400"
												: "border-border text-muted-foreground"
										)}
									>
										{insight.confidence ?? "low"} confidence
									</Badge>
									<span className="ml-auto">
										{new Date(insight.createdAt).toLocaleTimeString()}
									</span>
								</div>
							</div>
						))}
					</div>
				</ScrollArea>
			)}
		</div>
	);
}
