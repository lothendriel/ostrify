import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const appBuildId = new URL(import.meta.url).pathname;

export function ServiceWorkerUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const refreshRequestedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let updateCheckTimer: number | undefined;
    let installingWorker: ServiceWorker | null = null;
    let workerStateHandler: (() => void) | undefined;

    const showWaitingUpdate = () => {
      if (!disposed && registration?.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
    };

    const checkForUpdates = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };

    const handleUpdateFound = () => {
      if (installingWorker && workerStateHandler) {
        installingWorker.removeEventListener("statechange", workerStateHandler);
      }
      setDismissed(false);
      installingWorker = registration?.installing ?? null;
      if (!installingWorker) return;
      const observedWorker = installingWorker;
      workerStateHandler = () => {
        if (observedWorker.state === "installed") {
          const waitingWorker = registration?.waiting;
          if (waitingWorker && navigator.serviceWorker.controller) setUpdateAvailable(true);
          else setUpdateAvailable(false);
        }
      };
      observedWorker.addEventListener("statechange", workerStateHandler);
    };

    const handleControllerChange = () => {
      if (refreshRequestedRef.current) window.location.reload();
      else setUpdateAvailable(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdates();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const serviceWorkerUrl = new URL("/service-worker.js", window.location.origin);
    serviceWorkerUrl.searchParams.set("build", appBuildId);
    void navigator.serviceWorker.register(serviceWorkerUrl.toString(), { scope: "/" })
      .then((nextRegistration) => {
        if (disposed) return;
        registration = nextRegistration;
        registrationRef.current = nextRegistration;
        registration.addEventListener("updatefound", handleUpdateFound);
        showWaitingUpdate();
        checkForUpdates();
        updateCheckTimer = window.setInterval(checkForUpdates, 15 * 60 * 1000);
      })
      .catch(() => {
        // PWA updates are an enhancement; the app remains usable if registration fails.
      });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      registration?.removeEventListener("updatefound", handleUpdateFound);
      if (installingWorker && workerStateHandler) installingWorker.removeEventListener("statechange", workerStateHandler);
      if (updateCheckTimer !== undefined) window.clearInterval(updateCheckTimer);
      registrationRef.current = null;
    };
  }, []);

  const refreshToUpdate = () => {
    const waitingWorker = registrationRef.current?.waiting;
    if (!waitingWorker) return;
    refreshRequestedRef.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-[100] flex w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm">An Ostrify update is ready. Refresh to apply it.</p>
      <Button type="button" size="sm" onClick={refreshToUpdate}>Refresh now</Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Dismiss update notice"
        onClick={() => setDismissed(true)}
        className="px-2"
      >
        Dismiss
      </Button>
    </div>
  );
}
