"use client";

import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  pullRefreshCompleteEvent,
  pullRefreshEvent,
  showOfflineDialogEvent,
} from "@/lib/client-events";

type NetworkState = "checking" | "online" | "offline";

const pullThreshold = 72;
const maxPullDistance = 112;

function scrollContainerFor(target: EventTarget | null) {
  let element = target instanceof HTMLElement ? target : null;
  while (element && element !== document.body) {
    const overflowY = window.getComputedStyle(element).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight) {
      return element;
    }
    element = element.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

export function PwaClient() {
  const router = useRouter();
  const [networkState, setNetworkState] = useState<NetworkState>("checking");
  const [offlineDialogDismissed, setOfflineDialogDismissed] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const networkStateRef = useRef<NetworkState>("checking");
  const probeIdRef = useRef(0);
  const probeAbortRef = useRef<AbortController | null>(null);
  const pullStartRef = useRef<{ y: number; scroller: HTMLElement | null } | null>(null);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const refreshSafetyTimerRef = useRef<number | null>(null);

  const updateNetworkState = useCallback((nextState: NetworkState) => {
    const previousState = networkStateRef.current;
    networkStateRef.current = nextState;
    setNetworkState(nextState);
    if (nextState === "offline" && previousState !== "offline") setOfflineDialogDismissed(false);
    if (nextState === "online" && previousState === "offline") {
      setRecovered(true);
      window.setTimeout(() => setRecovered(false), 4200);
    }
  }, []);

  const probeConnection = useCallback(async () => {
    const probeId = ++probeIdRef.current;
    probeAbortRef.current?.abort();
    const controller = new AbortController();
    probeAbortRef.current = controller;
    setCheckingConnection(true);
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`/api/health?probe=${Date.now()}`, {
        cache: "no-store",
        headers: { "x-lenden-network-probe": "1" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Health probe failed (${response.status})`);
      if (probeId !== probeIdRef.current) return;
      updateNetworkState("online");
    } catch {
      if (probeId === probeIdRef.current) {
        // A health endpoint can time out while the device still has internet.
        // Only the browser's offline signal is allowed to open the offline dialog.
        updateNetworkState(navigator.onLine === false ? "offline" : "online");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (probeId === probeIdRef.current) setCheckingConnection(false);
    }
  }, [updateNetworkState]);

  const finishRefresh = useCallback(() => {
    if (refreshSafetyTimerRef.current !== null) window.clearTimeout(refreshSafetyTimerRef.current);
    refreshSafetyTimerRef.current = null;
    refreshingRef.current = false;
    pullDistanceRef.current = 0;
    setRefreshing(false);
    setPullDistance(0);
  }, []);

  const triggerRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    if (networkStateRef.current === "offline") {
      setOfflineDialogDismissed(false);
      finishRefresh();
      return;
    }

    refreshingRef.current = true;
    setRefreshing(true);
    setPullDistance(pullThreshold);
    const refreshEvent = new CustomEvent(pullRefreshEvent, { cancelable: true });
    const shouldUseRouterRefresh = window.dispatchEvent(refreshEvent);

    if (shouldUseRouterRefresh) {
      startTransition(() => router.refresh());
      window.setTimeout(finishRefresh, 1200);
    } else {
      refreshSafetyTimerRef.current = window.setTimeout(finishRefresh, 12000);
    }
  }, [finishRefresh, router]);

  useEffect(() => {
    function preventPageZoom(event: Event) {
      event.preventDefault();
    }

    function preventMultiTouchZoom(event: TouchEvent) {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    }

    function handleConnectionChange() {
      void probeConnection();
    }

    function handleShowOfflineDialog() {
      if (navigator.onLine === false) {
        setOfflineDialogDismissed(false);
      }
      void probeConnection();
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1 || refreshingRef.current) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [role='dialog'], .action-sheet, .notification-sheet")) return;
      const scroller = scrollContainerFor(event.target);
      if ((scroller?.scrollTop ?? window.scrollY) > 0) return;
      pullStartRef.current = { y: event.touches[0].clientY, scroller };
    }

    function handleTouchMove(event: TouchEvent) {
      if (!pullStartRef.current || event.touches.length !== 1) return;
      const { y, scroller } = pullStartRef.current;
      if ((scroller?.scrollTop ?? window.scrollY) > 0) {
        pullStartRef.current = null;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const distance = Math.min(maxPullDistance, Math.max(0, (event.touches[0].clientY - y) * 0.55));
      pullDistanceRef.current = distance;
      if (distance > 5) {
        event.preventDefault();
        setPullDistance(distance);
      }
    }

    function handleTouchEnd() {
      const shouldRefresh = pullDistanceRef.current >= pullThreshold;
      pullStartRef.current = null;
      if (shouldRefresh) triggerRefresh();
      else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    }

    const initialProbeId = window.setTimeout(handleConnectionChange, 0);

    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);
    window.addEventListener(showOfflineDialogEvent, handleShowOfflineDialog);
    window.addEventListener(pullRefreshCompleteEvent, finishRefresh);
    window.addEventListener("gesturestart", preventPageZoom, { passive: false });
    window.addEventListener("gesturechange", preventPageZoom, { passive: false });
    window.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .then((registration) => registration.update())
          .catch((error) => {
            console.warn("[lenden-pwa] service worker registration failed", error);
          });
      } else {
        // Next development chunks use stable URLs. A production service worker
        // left on localhost can otherwise serve an older chunk after a code edit.
        Promise.all([
          navigator.serviceWorker
            .getRegistrations()
            .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
          "caches" in window
            ? caches
                .keys()
                .then((keys) => Promise.all(keys.filter((key) => key.startsWith("lenden-")).map((key) => caches.delete(key))))
            : Promise.resolve([]),
        ]).catch((error) => {
          console.warn("[lenden-pwa] development cache cleanup failed", error);
        });
      }
    }

    return () => {
      probeAbortRef.current?.abort();
      window.clearTimeout(initialProbeId);
      if (refreshSafetyTimerRef.current !== null) window.clearTimeout(refreshSafetyTimerRef.current);
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
      window.removeEventListener(showOfflineDialogEvent, handleShowOfflineDialog);
      window.removeEventListener(pullRefreshCompleteEvent, finishRefresh);
      window.removeEventListener("gesturestart", preventPageZoom);
      window.removeEventListener("gesturechange", preventPageZoom);
      window.removeEventListener("touchmove", preventMultiTouchZoom);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [finishRefresh, probeConnection, triggerRefresh, updateNetworkState]);

  useEffect(() => {
    document.body.dataset.lendenNetwork = networkState;
    return () => {
      delete document.body.dataset.lendenNetwork;
    };
  }, [networkState]);

  const showOfflineDialog = networkState === "offline" && !offlineDialogDismissed;
  const showStatusPill =
    recovered ||
    (networkState === "offline" && offlineDialogDismissed);

  return (
    <>
      {pullDistance > 0 || refreshing ? (
        <div
          className={`pull-refresh-indicator ${refreshing ? "refreshing" : ""}`}
          style={{ transform: `translate(-50%, ${Math.min(54, pullDistance - 54)}px)` }}
          role="status"
          aria-live="polite"
        >
          <RefreshCw size={18} aria-hidden="true" />
          <span>{refreshing ? "Refreshing data…" : pullDistance >= pullThreshold ? "Release to refresh" : "Pull to refresh"}</span>
        </div>
      ) : null}

      {showStatusPill ? (
        <div className={`network-status-pill ${networkState === "offline" ? "offline" : "online"}`} role="status" aria-live="polite">
          {networkState === "offline" ? <CloudOff size={18} aria-hidden="true" /> : <Wifi size={18} aria-hidden="true" />}
          <span>
            {recovered
              ? "Back online. Your app can update again."
              : "Offline — showing saved data"}
          </span>
          {networkState === "offline" ? (
            <button className={checkingConnection ? "network-checking" : ""} type="button" onClick={() => void probeConnection()} aria-label="Retry connection" disabled={checkingConnection}>
              <RefreshCw size={17} />
            </button>
          ) : null}
        </div>
      ) : null}

      {showOfflineDialog ? (
        <div className="network-dialog-layer">
          <section className="network-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-dialog-title" aria-describedby="offline-dialog-description">
            <div className="network-dialog-icon" aria-hidden="true">
              <CloudOff size={30} />
            </div>
            <div>
              <p className="eyebrow">Connection paused</p>
              <h2 id="offline-dialog-title">No internet connection</h2>
            </div>
            <p id="offline-dialog-description">
              You can keep viewing saved Lenden data. New payments, approvals, and other money actions need internet and will not be submitted while offline.
            </p>
            <div className="network-dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setOfflineDialogDismissed(true)}>
                Continue offline
              </button>
              <button className={`primary-button ${checkingConnection ? "network-checking" : ""}`} type="button" onClick={() => void probeConnection()} disabled={checkingConnection}>
                <RefreshCw size={17} />
                {checkingConnection ? "Checking…" : "Try again"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
