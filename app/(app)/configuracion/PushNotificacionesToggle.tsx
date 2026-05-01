"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushNotificacionesToggle() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);

    (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);

      // Auto-resync: si el browser tiene subscription pero el server no
      // (puede haber pasado si una activacion previa fallo en el upload),
      // re-subir silenciosamente. Idempotente: upsert por endpoint.
      if (sub) {
        const json = sub.toJSON();
        try {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: json.endpoint,
              keys: json.keys,
              user_agent: navigator.userAgent,
            }),
          });
        } catch {
          /* no fatal */
        }
      }
    })();
  }, []);

  async function activar() {
    setBusy(true);
    setMsg(null);
    try {
      if (!VAPID_PUBLIC) throw new Error("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMsg("Permiso denegado. Activa notificaciones en los ajustes del navegador.");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast a BufferSource para satisfacer el typing actual de TS DOM lib
        // (Uint8Array<ArrayBufferLike> vs ArrayBufferView<ArrayBuffer>).
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "No pude registrar la suscripción en el servidor");
      }
      setSubscribed(true);
      setMsg("✓ Notificaciones activadas en este dispositivo");
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function desactivar() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: "DELETE" });
      }
      setSubscribed(false);
      setMsg("Notificaciones desactivadas en este dispositivo");
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function probar() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(`Error: ${j.error}`); return; }
    setMsg(`Test enviado a ${j.sent} dispositivo${j.sent !== 1 ? "s" : ""} (${j.removed} expirados, ${j.failed} fallos)`);
  }

  if (!supported) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">
        Este navegador no soporta web push. Prueba con Chrome, Edge o Safari 16+.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {subscribed ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--sage-deep)] font-medium">
            <Bell className="w-4 h-4" /> Activas en este dispositivo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[var(--muted-foreground)]">
            <BellOff className="w-4 h-4" /> No activas en este dispositivo
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!subscribed ? (
          <button onClick={activar} disabled={busy} className="btn-primary !text-xs">
            <Bell className="w-3.5 h-3.5" /> {busy ? "Activando…" : "Activar notificaciones"}
          </button>
        ) : (
          <>
            <button onClick={probar} disabled={busy} className="btn-primary !text-xs">
              <Send className="w-3.5 h-3.5" /> {busy ? "Enviando…" : "Mandar test"}
            </button>
            <button onClick={desactivar} disabled={busy} className="btn-ghost !text-xs">
              <BellOff className="w-3.5 h-3.5" /> Desactivar
            </button>
          </>
        )}
      </div>

      {msg && <p className="text-xs text-[var(--foreground)]">{msg}</p>}

      <p className="text-[11px] text-[var(--muted-foreground)]">
        Te avisaremos cuando una clienta complete el form de intake, llegue un pago, o haya alertas
        que requieran tu atención. Funciona en cualquier dispositivo donde actives.
      </p>
    </div>
  );
}
