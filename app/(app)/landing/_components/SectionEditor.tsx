"use client";

import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, Wand2, Save } from "lucide-react";
import type { SectionKind } from "@/lib/landing-builder/schema";

const KIND_LABEL: Record<SectionKind, string> = {
  hero: "Hero (encabezado principal)",
  propuesta_valor: "Propuesta de valor",
  beneficios: "Beneficios",
  sobre_mi: "Sobre mí",
  proceso: "Cómo trabajo",
  testimonios: "Testimonios",
  faq: "Preguntas frecuentes",
  cta: "Llamado a la acción final",
};

const KIND_HELP: Record<SectionKind, string> = {
  hero: "Frase principal que el visitante lee primero. ¿Qué problema resuelves?",
  propuesta_valor: "Por qué te elige a ti y no a otro asesor.",
  beneficios: "3-5 beneficios concretos. Empieza cada uno con un verbo.",
  sobre_mi: "Tu bio en 3ra persona. Profesión + años + diferencial.",
  proceso: "3-5 pasos de cómo trabajas con un cliente.",
  testimonios: "Frases reales de clientes (los escribes tú, AI no inventa).",
  faq: "5-8 preguntas que tus prospectos siempre te hacen.",
  cta: "Cierre. Última oportunidad de convertir el visitante en lead.",
};

export default function SectionEditor({
  landingId,
  section,
  onUpdated,
}: {
  landingId: string;
  section: any;
  onUpdated: (s: any) => void;
}) {
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState<null | "generate" | "refine" | "alternatives">(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<any>(section.content);
  const [meta, setMeta] = useState<any>(null);

  const callAi = async (action: "generate" | "refine" | "alternatives") => {
    setError(null);
    setLoading(action);
    try {
      const r = await fetch("/api/ai/landing-generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          landing_id: landingId,
          section_kind: section.kind,
          action,
          user_input: userInput.trim() || undefined,
          current_content: action === "generate" ? undefined : section.content,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        setMeta(data.meta);
        const updated = { ...section, content: data.content };
        setDraftContent(data.content);
        onUpdated(updated);
        setUserInput("");
      } else {
        if (data.error === "daily_limit_reached") {
          setError(
            `Llegaste al límite diario (${data.used_today}/${data.daily_limit}). Resetea en 24h.`
          );
        } else {
          setError(data.error ?? "error desconocido");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const onSaveManual = async () => {
    const r = await fetch(`/api/landing/sections/${section.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: draftContent }),
    });
    if (r.ok) {
      onUpdated({ ...section, content: draftContent });
      setEditing(false);
    } else {
      setError("save_failed");
    }
  };

  const isEmpty = !section.content || Object.keys(section.content).length === 0;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
      <div className="mb-1">
        <h2 className="text-xl font-semibold">{KIND_LABEL[section.kind as SectionKind]}</h2>
        <p className="text-sm text-[hsl(220_15%_55%)] mt-1">{KIND_HELP[section.kind as SectionKind]}</p>
      </div>

      {/* AI prompt area */}
      <div className="mt-6 space-y-3">
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder={
            isEmpty
              ? "Cuéntale a Claude qué quieres en esta sección. Ej: 'Soy asesora de pensiones IMSS con 12 años de experiencia. Ayudo a Régimen 73 y 97 a maximizar su pensión'"
              : "Pídele un cambio. Ej: 'hazlo más cercano' o 'agrega que es gratis la primera consulta'"
          }
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm resize-none"
        />

        <div className="flex items-center gap-2 flex-wrap">
          {isEmpty ? (
            <button
              onClick={() => callAi("generate")}
              disabled={loading !== null || !userInput.trim()}
              className="bg-[var(--navy-deep)] text-[var(--lime)] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {loading === "generate" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Generar con IA
            </button>
          ) : (
            <>
              <button
                onClick={() => callAi("refine")}
                disabled={loading !== null}
                className="bg-[var(--navy-deep)] text-[var(--lime)] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                {loading === "refine" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                Mejorar
              </button>
              <button
                onClick={() => callAi("alternatives")}
                disabled={loading !== null}
                className="border border-[var(--border)] px-4 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {loading === "alternatives" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Ver 3 alternativas
              </button>
              <button
                onClick={() => setEditing((e) => !e)}
                className="text-sm text-[hsl(220_15%_50%)] underline"
              >
                {editing ? "Cancelar edición" : "Editar manualmente"}
              </button>
            </>
          )}
        </div>

        {meta && (
          <p className="text-[0.7rem] text-[hsl(220_15%_55%)]">
            {meta.model.startsWith("claude-haiku") ? "Haiku" : "Sonnet"} ·{" "}
            {meta.tokens.input + meta.tokens.output} tokens · ${meta.cost_usd.toFixed(5)} ·
            cuota {meta.used_today}/{meta.daily_limit}
          </p>
        )}

        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Content preview / editor */}
      <div className="mt-6 pt-6 border-t border-[var(--border)]">
        {!isEmpty && !editing && (
          <ContentPreview kind={section.kind} content={section.content} />
        )}
        {editing && (
          <>
            <textarea
              value={JSON.stringify(draftContent, null, 2)}
              onChange={(e) => {
                try {
                  setDraftContent(JSON.parse(e.target.value));
                  setError(null);
                } catch {
                  setError("JSON inválido");
                }
              }}
              rows={12}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono text-xs"
            />
            <button
              onClick={onSaveManual}
              className="mt-3 bg-[var(--navy-deep)] text-[var(--lime)] px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" /> Guardar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ContentPreview({ kind, content }: { kind: SectionKind; content: any }) {
  // Render simple del contenido para que el cliente vea qué generó la IA.
  if (kind === "hero" || kind === "cta") {
    return (
      <div className="space-y-2">
        <h3 className="text-2xl font-bold">{content.headline}</h3>
        <p className="text-[hsl(220_15%_55%)]">{content.subheadline}</p>
        <button className="bg-[var(--lime)] text-[var(--navy-deep)] px-4 py-2 rounded-xl text-sm font-semibold">
          {content.cta_text ?? content.button_text}
        </button>
      </div>
    );
  }
  if (kind === "propuesta_valor") {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-2">{content.titulo}</h3>
        <p className="text-sm leading-relaxed">{content.parrafo}</p>
      </div>
    );
  }
  if (kind === "beneficios" || kind === "proceso") {
    const arr = content.items ?? content.pasos ?? [];
    return (
      <div>
        <h3 className="text-lg font-semibold mb-3">{content.titulo}</h3>
        <ul className="grid md:grid-cols-2 gap-3">
          {arr.map((it: any, i: number) => (
            <li key={i} className="border border-[var(--border)] rounded-lg p-3">
              <p className="font-semibold text-sm">
                {it.icon ? `${it.icon} ` : `${it.numero ?? i + 1}. `}
                {it.titulo}
              </p>
              <p className="text-xs text-[hsl(220_15%_55%)] mt-1">{it.descripcion}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (kind === "faq") {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-3">{content.titulo}</h3>
        <div className="space-y-3">
          {(content.items ?? []).map((q: any, i: number) => (
            <details key={i} className="border border-[var(--border)] rounded-lg p-3">
              <summary className="font-semibold text-sm cursor-pointer">{q.pregunta}</summary>
              <p className="text-xs text-[hsl(220_15%_55%)] mt-2">{q.respuesta}</p>
            </details>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "sobre_mi") {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-2">{content.titulo}</h3>
        <p className="text-sm leading-relaxed mb-3">{content.bio_corta}</p>
        {content.certificaciones?.length > 0 && (
          <ul className="space-y-1">
            {content.certificaciones.map((c: string, i: number) => (
              <li key={i} className="text-xs text-[hsl(220_15%_55%)]">• {c}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <pre className="text-xs bg-[var(--muted)] p-3 rounded-lg overflow-auto">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}
