"use client";

import { useState } from "react";
import { CreditCard, Copy, Check, MessageCircle, AlertCircle } from "lucide-react";

export default function StripeLinkButton({
  citaId, precioMxn, clienteWhatsapp,
}: {
  citaId: string;
  precioMxn: number;
  clienteWhatsapp: string | null;
}) {
  const [generando, setGenerando] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [monto, setMonto] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setGenerando(true);
    setError(null);
    const res = await fetch(`/api/citas/${citaId}/stripe-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ porcentaje_anticipo: 50 }),
    });
    const j = await res.json();
    setGenerando(false);
    if (!res.ok) {
      setError(j.hint || j.error);
      return;
    }
    setLink(j.url);
    setMonto(j.monto);
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!link) {
    return (
      <div>
        <button onClick={generar} disabled={generando} className="btn-primary !text-xs">
          <CreditCard className="w-3.5 h-3.5" /> {generando ? "Generando…" : "Generar link de anticipo"}
        </button>
        {error && (
          <div className="mt-2 bg-[hsl(35_90%_55%_/_0.08)] border border-[var(--warning)] rounded-lg p-2 text-xs flex items-start gap-2">
            <AlertCircle className="w-3 h-3 text-[var(--warning)] mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  const waText = encodeURIComponent(`Hello, hello 🌿 Para apartar tu cita necesito que confirmes el anticipo del 50% ($${monto.toFixed(0)} MXN). Aquí el link de pago seguro: ${link}\n\nEn cuanto pagues, queda apartada y te llega confirmación 💜`);
  const waUrl = clienteWhatsapp ? `https://wa.me/${clienteWhatsapp.replace(/[^0-9]/g, "")}?text=${waText}` : null;

  return (
    <div className="bg-[var(--sage-light)] rounded-lg p-3 mt-2">
      <p className="text-xs font-medium mb-2">✓ Link generado · Anticipo ${monto.toFixed(0)} MXN</p>
      <div className="flex gap-2 flex-wrap">
        <button onClick={copiar} className="btn-ghost !text-xs">
          {copied ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar link</>}
        </button>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" className="btn-primary !text-xs">
            <MessageCircle className="w-3 h-3" /> Mandar por WhatsApp
          </a>
        )}
      </div>
      <p className="text-[10px] text-[var(--muted-foreground)] mt-2 break-all">{link}</p>
    </div>
  );
}
