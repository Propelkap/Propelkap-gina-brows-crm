"use client";

/**
 * Permite al usuario logueado cambiar su contraseña sin pasar por
 * email recovery. Verifica password actual reautenticándose y luego
 * actualiza con auth.updateUser({ password }).
 */
import { useState } from "react";
import { Lock, Eye, EyeOff, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function CambiarPassword({ email }: { email: string }) {
  const sb = createClient();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirma, setConfirma] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Reglas de password
  const reglas = [
    { ok: nueva.length >= 8, label: "Mínimo 8 caracteres" },
    { ok: /[A-Z]/.test(nueva), label: "Al menos 1 mayúscula" },
    { ok: /[a-z]/.test(nueva), label: "Al menos 1 minúscula" },
    { ok: /[0-9]/.test(nueva), label: "Al menos 1 número" },
    { ok: nueva === confirma && confirma.length > 0, label: "Coinciden las contraseñas" },
  ];
  const todoOk = reglas.every((r) => r.ok);
  const puedeSubmit = actual.length > 0 && todoOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeSubmit) return;
    setBusy(true);
    setMsg(null);

    // 1. Re-autenticar con password actual para confirmar identidad
    const { error: authError } = await sb.auth.signInWithPassword({ email, password: actual });
    if (authError) {
      setBusy(false);
      setMsg({ type: "err", text: "La contraseña actual no es correcta." });
      return;
    }

    // 2. Actualizar password
    const { error: updateError } = await sb.auth.updateUser({ password: nueva });
    if (updateError) {
      setBusy(false);
      setMsg({ type: "err", text: `Error al actualizar: ${updateError.message}` });
      return;
    }

    setBusy(false);
    setActual("");
    setNueva("");
    setConfirma("");
    setMsg({
      type: "ok",
      text: "✓ Contraseña cambiada. La próxima vez que entres usa la nueva.",
    });
  }

  return (
    <div className="space-y-3 max-w-md">
      <p className="text-xs text-[var(--muted-foreground)]">
        Cambia tu contraseña sin pasar por email. Necesitas tu contraseña actual.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium block mb-1">
            Contraseña actual
          </label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              required
              className="!pr-10"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label="Mostrar/ocultar contraseña"
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium block mb-1">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="!pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label="Mostrar/ocultar contraseña"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium block mb-1">
            Confirmar nueva contraseña
          </label>
          <input
            type={showNew ? "text" : "password"}
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {/* Reglas de password */}
        {(nueva.length > 0 || confirma.length > 0) && (
          <ul className="space-y-1 text-[11px]">
            {reglas.map((r, i) => (
              <li
                key={i}
                className={`flex items-center gap-1.5 ${r.ok ? "text-[var(--sage-deep)]" : "text-[var(--muted-foreground)]"}`}
              >
                {r.ok ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 inline-block" />}
                {r.label}
              </li>
            ))}
          </ul>
        )}

        {msg && (
          <div
            className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
              msg.type === "ok"
                ? "bg-[var(--sage-light)] text-[var(--sage-deep)]"
                : "bg-[hsl(0_84%_60%_/_0.08)] text-[var(--destructive)]"
            }`}
          >
            {msg.type === "ok" ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!puedeSubmit || busy}
          className="btn-primary !text-xs disabled:opacity-50"
        >
          <Lock className="w-3.5 h-3.5" />
          {busy ? "Actualizando…" : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
}
