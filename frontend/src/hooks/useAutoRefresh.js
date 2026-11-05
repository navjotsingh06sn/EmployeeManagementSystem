import { useEffect, useRef } from "react";

export default function useAutoRefresh(refresh, intervalMs = 10000, enabled = true) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    async function refreshIfVisible() {
      const now = Date.now();
      if (
        document.visibilityState !== "visible" ||
        inFlightRef.current ||
        now - lastRefreshRef.current < 3000
      ) {
        return;
      }

      inFlightRef.current = true;
      lastRefreshRef.current = now;
      try {
        await refreshRef.current();
      } catch {
        // Page loaders handle and display their own request errors.
      } finally {
        inFlightRef.current = false;
      }
    }

    const timer = window.setInterval(refreshIfVisible, intervalMs);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [enabled, intervalMs]);
}
