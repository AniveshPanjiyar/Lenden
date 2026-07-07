"use client";

import { useEffect, useState } from "react";

export function PwaClient() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    function preventPageZoom(event: Event) {
      event.preventDefault();
    }

    function preventMultiTouchZoom(event: TouchEvent) {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("gesturestart", preventPageZoom, { passive: false });
    window.addEventListener("gesturechange", preventPageZoom, { passive: false });
    window.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch((error) => {
          console.warn("[lenden-pwa] service worker registration failed", error);
        });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("gesturestart", preventPageZoom);
      window.removeEventListener("gesturechange", preventPageZoom);
      window.removeEventListener("touchmove", preventMultiTouchZoom);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      Offline read-only mode. Money actions need internet.
    </div>
  );
}
