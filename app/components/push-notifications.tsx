"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
export default function PushNotifications({
  available,
}: {
  available: boolean;
}) {
  const [state, setState] = useState("checking"),
    [error, setError] = useState("");
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker
      .getRegistration("/")
      .then(async (r) =>
        setState((await r?.pushManager.getSubscription()) ? "enabled" : "off"),
      )
      .catch(() => setState("off"));
  }, []);
  async function toggle() {
    setError("");
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const r = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unsubscribe",
            endpoint: subscription.endpoint,
          }),
        });
        if (!r.ok) throw Error((await r.json()).error);
        await subscription.unsubscribe();
        setState("off");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("off");
        setError(
          "Notifications are blocked. Allow them in your browser settings to enable push updates.",
        );
        return;
      }
      const keys = await (await fetch("/api/notifications")).json();
      if (!keys.publicKey) throw Error("Push notifications are not configured");
      const raw = atob(keys.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", ...subscription.toJSON() }),
      });
      if (!r.ok) {
        await subscription.unsubscribe();
        throw Error((await r.json()).error);
      }
      setState("enabled");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not enable notifications",
      );
      setState("off");
    }
  }
  return (
    <div className="push-settings">
      <div>
        <Bell size={20} />
        <strong>Push notifications</strong>
      </div>
      {state === "unsupported" ? (
        <p>
          Use a browser with push support. In-app updates are always available.
        </p>
      ) : !available ? (
        <p>
          In-app updates are enabled. Push is not configured on this
          environment.
        </p>
      ) : (
        <button
          className="secondary"
          disabled={state === "checking" || state === "busy"}
          onClick={toggle}
        >
          {state === "enabled"
            ? "Disable push"
            : state === "busy"
              ? "Updating…"
              : "Enable push"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
