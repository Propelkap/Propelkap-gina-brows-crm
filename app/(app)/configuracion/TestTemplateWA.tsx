"use client";

import { useState } from "react";
import { Send, Check, AlertCircle } from "lucide-react";

const TEMPLATES = [
  { id: "recordatorio_cita_24h", label: "Recordatorio cita 24h", category: "UTILITY" },
  { id: "recordatorio_cita_2h", label: "Recordatorio cita 2h", category: "UTILITY" },
  { id: "confirmacion_cita_link_pago", label: "Confirmación cita + link pago", category: "UTILITY" },
  { id: "aviso_retoque_60d", label: "Aviso retoque 60d", category: "MARKETING" },
  { id: "aviso_retoque_anual", label: "Aviso retoque anual", category: "MARKETING" },
  { id: "cumpleanos_cupon", label: "Cumpleaños + cupón", category: "MARKETING" },
  { id: "reactivacion_dormida", label: "Reactivación dormida", category: "MARKETING" },
  { id: "pedir_resena_google", label: "Pedir reseña Google", category: "UTILITY" },
];

export default function TestTemplateWA() {
  const [to, setTo] = useState("+5218131175672");
  const [template, setTemplate] = useState("reactivacion_dormida");
  const [varName, setVarName] = useState("Mariana");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function enviar() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/whatsapp/test-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        template,
        vars: { "1": varName },
      }),
    });
    const j = await res.json();
    setBusy(false);
    setResult({ status: res.status, body: j });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Manda 1 mensaje real a un número usando una template Meta-aprobada.
        Útil para validar antes de lanzar campaña masiva. Funciona fuera de la
        ventana 24h porque usa template aprobada.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium block mb-1">
            Número (E.164)
          </label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+528131175672"
            className="!text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium block mb-1">
            Template
          </label>
          <select value={template} onChange={(e) => setTemplate(e.target.value)} className="!text-sm">
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.category}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium block mb-1">
            Variable {`{{1}}`} (nombre)
          </label>
          <input
            type="text"
            value={varName}
            onChange={(e) => setVarName(e.target.value)}
            placeholder="Mariana"
            className="!text-sm"
          />
        </div>
      </div>

      <button onClick={enviar} disabled={busy || !to || !template} className="btn-primary !text-xs">
        <Send className="w-3.5 h-3.5" /> {busy ? "Enviando…" : "Enviar test"}
      </button>

      {result && (
        <div className={`rounded-xl p-3 border text-xs ${
          result.body.ok
            ? "bg-[var(--sage-light)] border-[var(--sage-deep)]/40 text-[var(--sage-deep)]"
            : "bg-[hsl(0_84%_60%_/_0.08)] border-[var(--destructive)]/40 text-[var(--destructive)]"
        }`}>
          <div className="flex items-start gap-2">
            {result.body.ok ? (
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold mb-1">
                {result.body.ok ? "✓ Mensaje enviado" : `Falló (HTTP ${result.status})`}
              </p>
              {result.body.twilio_sid && (
                <p className="font-mono text-[10px]">Twilio SID: {result.body.twilio_sid}</p>
              )}
              {result.body.estado && <p className="text-[10px]">Estado: {result.body.estado}</p>}
              {result.body.error && <p className="text-[10px]">Error: {result.body.error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
