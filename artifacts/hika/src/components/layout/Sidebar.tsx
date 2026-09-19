import { Link, useLocation } from "wouter";
import {
  Home,
  LayoutDashboard,
  Plus,
  History,
  FileText,
  Bot,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthSession } from "@/lib/auth";

const sections = [
  {
    items: [
      { name: "Home", href: "/dashboard", icon: Home },
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "New Session", href: "/session", icon: Plus, accent: true },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      { name: "History", href: "/history", icon: History },
      { name: "Documents", href: "/documents", icon: FileText },
    ],
  },
  {
    label: "PLAN",
    items: [
      { name: "Pricing", href: "/pricing", icon: Bot },
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
          "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all select-none border border-transparent",
          active
            ? "bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(108,99,255,0.16)]"
            : accent
            ? "bg-gradient-to-r from-[#6c63ff]/16 to-[#8b5cf6]/12 text-[#c7b8ff] hover:bg-[#6c63ff]/22"
            : "text-white/60 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.08]"
        )}
      >
        {active && (
          <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-gradient-to-b from-[#6c63ff] to-[#00e5ff]" />
        )}
        <Icon
          size={15}
          className={cn(
            "flex-shrink-0",
            active ? "text-[#8b5cf6]" : accent ? "text-[#8b5cf6]" : "text-white/60"
          )}
        />
        <span className="flex-1 truncate">{name}</span>
        {badge && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function Sidebar() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    if (href === "/dashboard") return location === "/dashboard";
    return location.startsWith(href);
  };

  return (
    <div className="relative w-[248px] flex-shrink-0 flex flex-col h-[100dvh] overflow-hidden border-r border-white/10 bg-[rgba(7,7,15,0.68)] backdrop-blur-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(108,99,255,0.18),_transparent_32%)] pointer-events-none" />
      {/* Logo */}
      <div className="relative flex items-center gap-2.5 px-4 py-5 border-b border-white/10 flex-shrink-0">
        <img src="/icons/icon.png" alt="Hikanest" className="w-9 h-9 rounded-2xl object-cover flex-shrink-0 shadow-[0_0_24px_rgba(108,99,255,0.35)]" />
        <div>
          <div className="text-sm font-semibold tracking-tight leading-none text-white">Hikanest</div>
          <div className="text-[10px] text-white/45 mt-0.5">AI Meeting Assistant</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 overflow-y-auto px-3 py-3 space-y-5">
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
      <div className="relative px-3 py-3 border-t border-white/10 flex-shrink-0 space-y-0.5">
        {bottomItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
          />
        ))}
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl border border-white/10 bg-white/[0.04]">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6c63ff] to-[#00e5ff] flex items-center justify-center flex-shrink-0">
            <User size={12} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-white">{getAuthSession()?.email || "Account"}</p>
            <p className="text-[10px] text-white/45 truncate">Firebase workspace</p>
          </div>
        </div>
      </div>
    </div>
  );
}
