"use client";

import { CloudOff, RefreshCw, Wifi, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  pullRefreshCompleteEvent,
  pullRefreshEvent,
  showOfflineDialogEvent,
} from "@/lib/client-events";

type NetworkState = "checking" | "online" | "slow" | "offline";

type NetworkInformation = EventTarget & {
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
};

const pullThreshold = 72;
const maxPullDistance = 112;

function browserConnection() {
  if (typeof navigator === "undefined") return undefined;
  const connectedNavigator = navigator as NavigatorWithConnection;
  return connectedNavigator.connection ?? connectedNavigator.mozConnection ?? connectedNavigator.webkitConnection;
}

function connectionLooksSlow(connection = browserConnection()) {
  if (!connection) return false;
  return (
    connection.effectiveType === "slow-2g" ||
    connection.effectiveType === "2g" ||
    (typeof connection.downlink === "number" && connection.downlink > 0 && connection.downlink < 1) ||
    (typeof connection.rtt === "number" && connection.rtt > 900)
  );
}

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
  const [slowNoticeDismissed, setSlowNoticeDismissed] = useState(false);
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
    if (nextState === "slow" && previousState !== "slow") setSlowNoticeDismissed(false);
    if (nextState === "online" && (previousState === "offline" || previousState === "slow")) {
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
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    const startedAt = performance.now();

    try {
      const response = await fetch(`/api/health?probe=${Date.now()}`, {
        cache: "no-store",
        headers: { "x-lenden-network-probe": "1" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Health probe failed (${response.status})`);
      if (probeId !== probeIdRef.current) return;
      const tookMs = performance.now() - startedAt;
      updateNetworkState(connectionLooksSlow() || tookMs > 2500 ? "slow" : "online");
    } catch {
      if (probeId === probeIdRef.current) updateNetworkState("offline");
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
      setOfflineDialogDismissed(false);
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

    const connection = browserConnection();
    const initialProbeId = window.setTimeout(() => void probeConnection(), 0);
    const probeIntervalId = window.setInterval(() => void probeConnection(), 30000);

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
    connection?.addEventListener("change", handleConnectionChange);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch((error) => {
          console.warn("[lenden-pwa] service worker registration failed", error);
        });
    }

    return () => {
      probeAbortRef.current?.abort();
      window.clearTimeout(initialProbeId);
      window.clearInterval(probeIntervalId);
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
      connection?.removeEventListener("change", handleConnectionChange);
    };
  }, [finishRefresh, probeConnection, triggerRefresh]);

  useEffect(() => {
    document.body.dataset.lendenNetwork = networkState;
    return () => {
      delete document.body.dataset.lendenNetwork;
    };
  }, [networkState]);

  const showOfflineDialog = networkState === "offline" && !offlineDialogDismissed;
  const showStatusPill =
    recovered ||
    (networkState === "offline" && offlineDialogDismissed) ||
    (networkState === "slow" && !slowNoticeDismissed);

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
        <div className={`network-status-pill ${networkState === "offline" ? "offline" : networkState === "slow" ? "slow" : "online"}`} role="status" aria-live="polite">
          {networkState === "offline" ? <CloudOff size={18} aria-hidden="true" /> : <Wifi size={18} aria-hidden="true" />}
          <span>
            {recovered
              ? "Back online. Your app can update again."
              : networkState === "offline"
                ? "Offline — showing saved data"
                : "Slow connection — updates may take longer"}
          </span>
          {networkState === "offline" ? (
            <button className={checkingConnection ? "network-checking" : ""} type="button" onClick={() => void probeConnection()} aria-label="Retry connection" disabled={checkingConnection}>
              <RefreshCw size={17} />
            </button>
          ) : networkState === "slow" ? (
            <button type="button" onClick={() => setSlowNoticeDismissed(true)} aria-label="Dismiss slow connection message">
              <X size={17} />
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
