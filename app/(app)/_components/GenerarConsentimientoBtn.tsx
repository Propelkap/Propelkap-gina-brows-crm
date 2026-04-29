"use client";

import { useState } from "react";
import { FileSignature, Copy, Check, MessageCircle, AlertCircle } from "lucide-react";

export default function GenerarConsentimientoBtn({
  clienteId, citaId, clienteNombre, clienteWhatsapp, defaultTipo,
}: {
  clienteId: string;
  citaId?: string | null;
  clienteNombre?: string | null;
  clienteWhatsapp?: string | null;
  defaultTipo?: string; // 'microblading_v1' | 'remocion_laser_v1'
}) {
  const [generating, setGenerating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTipoSelector, setShowTipoSelector] = useState(false);

  async function generar(tipo?: string) {
    setGenerating(true);
    setError(null);
    setShowTipoSelector(false);
    const res = await fetch("/api/consentimientos/generar-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_id: clienteId,
        cita_id: citaId || null,
        template_tipo: tipo || defaultTipo,
      }),
    });
    const j = await res.json();
    setGenerating(false);
    if (!res.ok) {
      // Si no hay match de template y no se especificó, mostrar selector
      if (j.error?.includes("template aplicable") && !tipo) {
        setShowTipoSelector(true);
        return;
      }
      setError(j.error || "Error generando link");
      return;
    }
    setLink(j.url);
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (link) {
    const nombre = clienteNombre?.split(" ")[0] ?? "";
    const waText = encodeURIComponent(`Hello, hello ${nombre} 🌿 Antes de tu tratamiento, por favor llena tu formulario de consentimiento desde aquí (5 min): ${link}\n\n¡Te esperamos! 💜`);
    const waUrl = clienteWhatsapp ? `https://wa.me/${clienteWhatsapp.replace(/[^0-9]/g, "")}?text=${waText}` : null;

    return (
      <div className="bg-[var(--sage-light)] rounded-lg p-3 mt-2">
        <p className="text-xs font-medium mb-2 text-[var(--sage-deep)]">✓ Link generado · Válido 7 días</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copiar} className="btn-ghost !text-xs">
            {copied ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
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

  return (
    <div>
      {!showTipoSelector ? (
        <button onClick={() => generar()} disabled={generating} className="btn-ghost !text-xs">
          <FileSignature className="w-3 h-3" />
          {generating ? "Generando…" : "Generar consentimiento"}
        </button>
      ) : (
        <div className="bg-[var(--card)] rounded-lg p-3 mt-2 space-y-2">
          <p className="text-xs text-[var(--muted-foreground)]">¿Qué tipo de consentimiento?</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => generar("microblading_v1")} className="btn-ghost !text-xs">
              💄 Microblading
            </button>
            <button onClick={() => generar("remocion_laser_v1")} className="btn-ghost !text-xs">
              ⚡ Remoción láser
            </button>
            <button onClick={() => setShowTipoSelector(false)} className="text-xs text-[var(--muted-foreground)]">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2 bg-[hsl(0_84%_60%_/_0.08)] border border-[var(--destructive)] rounded-lg p-2 text-xs flex items-start gap-2">
          <AlertCircle className="w-3 h-3 text-[var(--destructive)] mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
