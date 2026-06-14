"use client";

import { useEffect } from "react";

const RESET_FLAG = "schedule-ai-cache-reset-v3";

export function CacheReset() {
  useEffect(() => {
    async function clearLegacyCaches() {
      if (!("serviceWorker" in navigator)) {
        return;
      }

      const alreadyReset = window.localStorage.getItem(RESET_FLAG);
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = "caches" in window ? await caches.keys() : [];

      if (alreadyReset && registrations.length === 0 && cacheKeys.length === 0) {
        return;
      }

      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }

      window.localStorage.setItem(RESET_FLAG, "done");

      if (navigator.serviceWorker.controller) {
        window.location.reload();
      }
    }

    clearLegacyCaches().catch(() => {
      // Cache cleanup is best-effort; the app should continue even if browser APIs fail.
    });
  }, []);

  return null;
}
