import { useEffect, useState } from "react";
import { getStoredSessionToken } from "@/lib/auth";

export default function DesktopConnect() {
  const [message, setMessage] = useState("Opening Hikanest desktop...");

  useEffect(() => {
    async function connect() {
      const token = getStoredSessionToken();
      if (!token) {
        window.location.assign("/login?next=%2Fdesktop-connect");
        return;
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
        const response = await fetch(`${apiUrl}/api/auth/desktop/handoff`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json() as { handoffUrl?: string; error?: string };
        if (!response.ok || !result.handoffUrl) throw new Error(result.error || "Could not open the desktop app.");
        window.location.assign(result.handoffUrl);
        setMessage("Hikanest desktop is ready. You can return to the app.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not open the desktop app.");
      }
    }
    void connect();
  }, []);

  return <div className="min-h-screen bg-[#07070f] text-white flex items-center justify-center p-6 text-center text-sm">{message}</div>;
}