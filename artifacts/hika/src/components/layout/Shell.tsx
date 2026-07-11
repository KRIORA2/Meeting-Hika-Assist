import React from "react";
import Sidebar from "./Sidebar";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 h-full overflow-y-auto overflow-x-hidden relative">
        {children}
      </main>
    </div>
  );
}
