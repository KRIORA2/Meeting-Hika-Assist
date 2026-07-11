import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Plus,
  History,
  FileText,
  Brain,
  Bot,
  Settings,
  User,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  {
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "New Session", href: "/session", icon: Plus, accent: true },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      { name: "History", href: "/history", icon: History },
      { name: "Documents", href: "/documents", icon: FileText },
      { name: "Knowledge Base", href: "/documents", icon: Brain },
    ],
  },
  {
    label: "AI",
    items: [
      { name: "AI Models", href: "/settings", icon: Bot, badge: "soon" },
    ],
  },
];

const bottomItems = [
  { name: "Settings", href: "/settings", icon: Settings },
];

type NavItemProps = {
  name: string;
  href: string;
  icon: React.ElementType;
  active: boolean;
  accent?: boolean;
  badge?: string;
};

function NavItem({ name, href, icon: Icon, active, accent, badge }: NavItemProps) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all select-none",
          active
            ? "bg-primary/10 text-primary"
            : accent
            ? "bg-primary/5 text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {active && (
          <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-full" />
        )}
        <Icon
          size={15}
          className={cn(
            "flex-shrink-0",
            active ? "text-primary" : accent ? "text-primary/70" : "text-muted-foreground"
          )}
        />
        <span className="flex-1 truncate">{name}</span>
        {badge && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function Sidebar() {
  const [location] = useLocation();

  const isActive = (href: string) =>
    href === "/dashboard" ? location === "/dashboard" : location.startsWith(href);

  return (
    <div
      className="w-[220px] flex-shrink-0 flex flex-col h-[100dvh] overflow-hidden"
      style={{ background: "hsl(var(--sidebar))", borderRight: "1px solid hsl(var(--sidebar-border))" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border flex-shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, hsl(238 84% 67%), hsl(265 89% 72%))",
            boxShadow: "0 0 16px hsla(238,84%,67%,0.35)",
          }}
        >
          <Zap size={13} className="text-white" fill="white" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight leading-none">Hika</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">AI Meeting Assistant</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {sections.map((section, si) => (
          <div key={si} className="space-y-0.5">
            {section.label && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 pb-1">
                {section.label}
              </p>
            )}
            {section.items.map((item) => (
              <NavItem
                key={item.href + item.name}
                {...item}
                active={isActive(item.href)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-sidebar-border flex-shrink-0 space-y-0.5">
        {bottomItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
          />
        ))}
        <div className="flex items-center gap-3 px-3 py-2 mt-1">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <User size={12} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">Account</p>
            <p className="text-[10px] text-muted-foreground truncate">Free plan</p>
          </div>
        </div>
      </div>
    </div>
  );
}
