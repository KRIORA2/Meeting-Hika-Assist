import { useState, useCallback, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

export function usePiPWindow() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);
  const rootRef = useRef<Root | null>(null);

  const isPiPSupported =
    typeof window !== "undefined" && "documentPictureInPicture" in window;

  const openPiP = useCallback(
    async (width = 460, height = 400): Promise<Window | null> => {
      // Tear down any existing PiP
      try { rootRef.current?.unmount(); } catch { /* ok */ }
      rootRef.current = null;
      pipRef.current?.close();

      let pip: Window;

      if (isPiPSupported) {
        pip = await (
          window as unknown as {
            documentPictureInPicture: {
              requestWindow: (o: { width: number; height: number }) => Promise<Window>;
            };
          }
        ).documentPictureInPicture.requestWindow({ width, height });
      } else {
        // Fallback: regular popup (user must share specific window, not full screen)
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const w = window.open(
          `${base}/stealth`,
          "hika-stealth",
          `width=${width},height=${height},resizable=yes,scrollbars=no,` +
            `status=no,toolbar=no,menubar=no,location=no`
        );
        if (!w) return null;
        pip = w;
      }

      // Base styles so the window is dark immediately
      pip.document.documentElement.classList.add("dark");
      Object.assign(pip.document.documentElement.style, {
        background: "#09090b",
        color: "#fafafa",
        margin: "0",
        padding: "0",
        height: "100%",
      });
      Object.assign(pip.document.body.style, {
        margin: "0",
        padding: "0",
        height: "100%",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      });

      // Copy all stylesheets so Tailwind classes work inside the PiP window
      document
        .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
        .forEach((link) => {
          const el = pip.document.createElement("link");
          el.rel = "stylesheet";
          el.href = link.href;
          pip.document.head.appendChild(el);
        });
      document.querySelectorAll("style").forEach((style) => {
        const el = pip.document.createElement("style");
        el.textContent = style.textContent;
        pip.document.head.appendChild(el);
      });

      // Create a proper React root inside the PiP window.
      // This wires up React's event delegation for that window so button
      // clicks and synthetic events work correctly.
      const root = createRoot(pip.document.body);
      rootRef.current = root;

      pip.addEventListener("pagehide", () => {
        try { root.unmount(); } catch { /* ok */ }
        rootRef.current = null;
        setPipWindow(null);
        pipRef.current = null;
      });

      pipRef.current = pip;
      setPipWindow(pip);
      return pip;
    },
    [isPiPSupported]
  );

  /** Push a new React element into the PiP window. Call whenever state changes. */
  const renderToPiP = useCallback((el: ReactElement) => {
    rootRef.current?.render(el);
  }, []);

  const closePiP = useCallback(() => {
    try { rootRef.current?.unmount(); } catch { /* ok */ }
    rootRef.current = null;
    pipRef.current?.close();
    setPipWindow(null);
    pipRef.current = null;
  }, []);

  return { pipWindow, isPiPSupported, openPiP, renderToPiP, closePiP };
}
