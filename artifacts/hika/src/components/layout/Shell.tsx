import React from "react";
import Sidebar from "./Sidebar";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(108,99,255,0.18),_transparent_32%),linear-gradient(135deg,_#06070e_0%,_#090b16_100%)] text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(255,255,255,0.03)_0%,_rgba(255,255,255,0)_30%,_rgba(255,255,255,0.02)_100%)] pointer-events-none" />
      <Sidebar />
      <main className="relative flex-1 h-full overflow-y-auto overflow-x-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(0,229,255,0.08),_transparent_28%)] pointer-events-none" />
        {children}
      </main>
    </div>
  );
}
