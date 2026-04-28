"use client";

import { useState } from "react";
import { X, Check, Mail, MessageCircle, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const EMOJIS = ["🌿", "💜", "✨", "🎂", "⭐", "💌", "💄", "👁️", "🌸", "🤍", "📅", "💆"];

export default function TemplateEditor({
  template, onClose, onSaved,
}: {
  template: any | null;
  onClose: () => void;
  onSaved: (t: any) => void;
}) {
  const sb = createClient();
  const [data, setData] = useState({
    nombre: template?.nombre ?? "",
    tipo: (template?.tipo as "email" | "whatsapp") ?? "whatsapp",
    asunto: template?.asunto ?? "",
    cuerpo_texto: template?.cuerpo_texto ?? "",
    emoji: template?.emoji ?? "🌿",
  });
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function save() {
    setSaving(true);
    const payload: any = { ...data };
    if (data.tipo !== "email") payload.asunto = null;

    if (template?.id) {
      const { data: updated } = await sb.from("email_templates").update(payload).eq("id", template.id).select("*").single();
      onSaved(updated);
    } else {
      const { data: created } = await sb.from("email_templates").insert(payload).select("*").single();
      onSaved(created);
    }
    setSaving(false);
  }

  const previewBody = data.cuerpo_texto.replace(/\{\{nombre\}\}/g, "Karina").replace(/\{\{apellido\}\}/g, "Fernández").replace(/\{\{cumpleanos\}\}/g, "27 de abril");

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.6)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--background)] rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--background)] z-10">
          <div>
            <p className="eyebrow !text-[var(--primary-dark)] mb-0.5">{template ? "Editar" : "Nuevo"}</p>
            <h2 className="text-xl">{template?.nombre || "Template nuevo"}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block font-medium">Nombre interno</label>
              <input type="text" value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })} placeholder="Ej: Bienvenida nueva clienta" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block font-medium">Tipo</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setData({ ...data, tipo: "whatsapp" })}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border ${data.tipo === "whatsapp" ? "bg-[var(--secondary)] border-[var(--primary)]" : "border-[var(--border)] bg-white"}`}
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WA
                </button>
                <button
                  onClick={() => setData({ ...data, tipo: "email" })}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border ${data.tipo === "email" ? "bg-[var(--secondary)] border-[var(--primary)]" : "border-[var(--border)] bg-white"}`}
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
              </div>
            </div>
          </div>

          {data.tipo === "email" && (
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block font-medium">Asunto del email</label>
              <input type="text" value={data.asunto} onChange={(e) => setData({ ...data, asunto: e.target.value })} placeholder="Algo que se note en la bandeja" />
            </div>
          )}

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block font-medium">Emoji del template</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setData({ ...data, emoji: e })}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition-colors ${
                    data.emoji === e ? "border-[var(--primary)] bg-[var(--secondary)]/40" : "border-[var(--border)] bg-white hover:border-[var(--primary)]"
                  }`}
                >{e}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block font-medium">
              Mensaje (usa <code className="bg-[var(--muted)] px-1 rounded">{`{{nombre}}`}</code>, <code className="bg-[var(--muted)] px-1 rounded">{`{{cupon}}`}</code>, etc.)
            </label>
            <textarea
              value={data.cuerpo_texto}
              onChange={(e) => setData({ ...data, cuerpo_texto: e.target.value })}
              rows={8}
              placeholder="Hello, hello {{nombre}} 🌿..."
            />
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{data.cuerpo_texto.length} caracteres</p>
          </div>

          {/* Preview */}
          <div>
            <p className="eyebrow !text-[var(--sage-deep)] mb-2">Vista previa con datos reales</p>
            <div className={`rounded-2xl p-4 max-w-md border ${
              data.tipo === "whatsapp"
                ? "bg-[hsl(80_45%_92%)] rounded-tl-sm border-[var(--border)]"
                : "bg-white border-[var(--border)]"
            }`}>
              {data.tipo === "email" && data.asunto && <p className="font-semibold mb-2 text-sm">{data.asunto}</p>}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{previewBody || <em className="text-[var(--muted-foreground)]">El mensaje aparecerá aquí…</em>}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancelar</button>
            <button onClick={save} disabled={!data.nombre.trim() || !data.cuerpo_texto.trim() || saving} className="btn-primary flex-1 justify-center">
              {saving ? "Guardando…" : <><Check className="w-4 h-4" /> Guardar template</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
