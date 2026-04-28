"use client";

import { useState } from "react";
import { Plus, Mail, MessageCircle, Send, Edit, Trash2, Copy } from "lucide-react";
import TemplateEditor from "./TemplateEditor";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Template = {
  id: string;
  nombre: string;
  tipo: "email" | "whatsapp";
  asunto: string | null;
  cuerpo_texto: string;
  cuerpo_html: string | null;
  emoji: string | null;
  veces_usado: number;
  ultimo_uso: string | null;
};

const VARS_DISPONIBLES = [
  { v: "nombre", desc: "Nombre de la clienta" },
  { v: "apellido", desc: "Apellido" },
  { v: "cumpleanos", desc: "Fecha de cumpleaños" },
  { v: "ultima_cita", desc: "Fecha de su última cita" },
  { v: "servicio_estrella", desc: "Servicio que más se le ha hecho" },
  { v: "cupon", desc: "Código de cupón generado" },
  { v: "link_resena", desc: "Link a Google reseñas" },
  { v: "link_pago", desc: "Link de pago Stripe" },
];

export default function MarketingClient({ templates: initialTemplates }: { templates: Template[] }) {
  const router = useRouter();
  const sb = createClient();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  async function deleteTemplate(id: string) {
    if (!confirm("¿Archivar este template?")) return;
    await sb.from("email_templates").update({ archivado: true }).eq("id", id);
    setTemplates(templates.filter((t) => t.id !== id));
  }

  async function duplicate(t: Template) {
    const { data, error } = await sb.from("email_templates").insert({
      nombre: `${t.nombre} (copia)`,
      tipo: t.tipo,
      asunto: t.asunto,
      cuerpo_texto: t.cuerpo_texto,
      cuerpo_html: t.cuerpo_html,
      emoji: t.emoji,
    }).select("*").single();
    if (data && !error) setTemplates([data, ...templates]);
  }

  return (
    <div className="max-w-6xl">
      <header className="mb-8 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Tu voz, multiplicada</p>
          <h1 className="text-3xl mt-1">Marketing</h1>
          <p className="text-[var(--muted-foreground)] mt-2 max-w-xl">
            Crea, guarda y reutiliza templates con tu voz para WhatsApp y email. Cualquier idea que tengas, conviértela en mensaje en 30 segundos.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Crear template
        </button>
      </header>

      {/* Variables disponibles tip */}
      <div className="card mb-6 bg-[var(--secondary)]/15 border-[var(--primary)]">
        <p className="eyebrow !text-[var(--primary-dark)] mb-2">💡 Variables que puedes usar</p>
        <div className="flex flex-wrap gap-2">
          {VARS_DISPONIBLES.map((v) => (
            <code key={v.v} className="text-xs bg-white px-2 py-1 rounded-md border border-[var(--border)] font-mono" title={v.desc}>
              {`{{${v.v}}}`}
            </code>
          ))}
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          Cuando envíes el template, se reemplazan automáticamente con los datos reales de cada clienta.
        </p>
      </div>

      {/* Grid de templates */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => (
          <div key={t.id} className="card hover:shadow-[0_4px_24px_-8px_hsl(149_30%_28%_/_0.15)] transition-shadow flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[var(--secondary)]/40 flex items-center justify-center text-lg">
                  {t.emoji || (t.tipo === "email" ? "📧" : "💬")}
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight">{t.nombre}</h3>
                  <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">{t.tipo}</p>
                </div>
              </div>
            </div>
            {t.asunto && <p className="text-xs font-medium mb-1 text-[var(--sage-deep)]">{t.asunto}</p>}
            <p className="text-xs text-[var(--muted-foreground)] line-clamp-3 mb-4 flex-1 whitespace-pre-wrap">{t.cuerpo_texto}</p>

            <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] mb-3">
              <span>{t.veces_usado} usos</span>
              {t.ultimo_uso && <span>último: {new Date(t.ultimo_uso).toLocaleDateString("es-MX")}</span>}
            </div>

            <div className="flex gap-1">
              <button onClick={() => setEditing(t)} className="btn-ghost flex-1 justify-center !text-xs !py-1.5"><Edit className="w-3 h-3" /> Editar</button>
              <button onClick={() => duplicate(t)} className="btn-ghost !px-2 !py-1.5" title="Duplicar"><Copy className="w-3 h-3" /></button>
              <button onClick={() => deleteTemplate(t.id)} className="btn-ghost !px-2 !py-1.5 text-[var(--destructive)]" title="Archivar"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}

        <button
          onClick={() => setCreating(true)}
          className="card border-dashed border-2 hover:border-[var(--primary)] flex flex-col items-center justify-center min-h-[180px] text-[var(--muted-foreground)] hover:text-[var(--primary-dark)] transition-colors"
        >
          <Plus className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm font-medium">Nuevo template</p>
          <p className="text-xs">Empieza desde cero</p>
        </button>
      </div>

      {(editing || creating) && (
        <TemplateEditor
          template={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={(saved) => {
            setEditing(null);
            setCreating(false);
            if (editing) {
              setTemplates(templates.map((t) => (t.id === saved.id ? saved : t)));
            } else {
              setTemplates([saved, ...templates]);
            }
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
