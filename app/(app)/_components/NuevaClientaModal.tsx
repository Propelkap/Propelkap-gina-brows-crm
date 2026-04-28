"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

const ORIGENES = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google" },
  { id: "referida", label: "Referida" },
  { id: "walk_in", label: "Walk-in" },
  { id: "whatsapp_directo", label: "WhatsApp directo" },
  { id: "meta_ads", label: "Meta Ads" },
  { id: "google_ads", label: "Google Ads" },
  { id: "otro", label: "Otro" },
];

export default function NuevaClientaModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const router = useRouter();
  const [data, setData] = useState({
    nombre: "", apellido: "", email: "", whatsapp: "", fecha_nacimiento: "", notas: "", origen_lead: "instagram",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!data.nombre.trim() || (!data.whatsapp.trim() && !data.email.trim())) {
      setError("Necesito mínimo nombre + teléfono o email");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const j = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(j.error || "Error al crear clienta");
      return;
    }
    if (onCreated) onCreated(j.id);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.6)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--background)] rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--background)] z-10">
          <div>
            <p className="eyebrow !text-[var(--primary-dark)] mb-0.5">Nueva clienta</p>
            <h2 className="text-xl">Agregar al CRM</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5 block">Nombre *</label>
              <input type="text" value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5 block">Apellido</label>
              <input type="text" value={data.apellido} onChange={(e) => setData({ ...data, apellido: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5 block">WhatsApp *</label>
            <input type="tel" value={data.whatsapp} onChange={(e) => setData({ ...data, whatsapp: e.target.value })} placeholder="+528130791032 o solo 8130791032" />
            <p className="text-xs text-[var(--muted-foreground)] mt-1">Formato MX automático</p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5 block">Email</label>
            <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5 block">Cumpleaños</label>
            <input type="date" value={data.fecha_nacimiento} onChange={(e) => setData({ ...data, fecha_nacimiento: e.target.value })} />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5 block">¿Cómo te conoció?</label>
            <select value={data.origen_lead} onChange={(e) => setData({ ...data, origen_lead: e.target.value })}>
              {ORIGENES.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5 block">Notas</label>
            <textarea value={data.notas} onChange={(e) => setData({ ...data, notas: e.target.value })} rows={2} />
          </div>

          {error && <div className="bg-[hsl(0_84%_60%_/_0.1)] border border-[var(--destructive)] rounded-xl p-3 text-sm text-[var(--destructive)]">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancelar</button>
            <button onClick={submit} disabled={submitting} className="btn-primary flex-1 justify-center">
              {submitting ? "Creando…" : "Agregar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
