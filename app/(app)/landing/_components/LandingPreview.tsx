"use client";

import { Eye } from "lucide-react";

export default function LandingPreview({
  landing,
  sections,
}: {
  landing: any;
  sections: any[];
}) {
  const config = landing.config ?? {};
  const colors = config.colors ?? {};

  const filled = sections.filter(
    (s) => s.enabled && s.content && Object.keys(s.content).length > 0
  );

  if (filled.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border)] rounded-2xl p-8 text-center text-sm text-[hsl(220_15%_55%)]">
        <Eye className="w-6 h-6 mx-auto mb-2 opacity-40" />
        <p>Genera al menos una sección para ver la preview.</p>
      </div>
    );
  }

  return (
    <div
      className="border border-[var(--border)] rounded-2xl overflow-hidden text-xs"
      style={{
        background: colors.bg ?? "#fff",
        color: colors.text ?? "#1a1a1a",
      }}
    >
      <div className="px-3 py-2 bg-[var(--muted)] border-b border-[var(--border)] flex items-center gap-1.5 text-[0.65rem] font-mono">
        <span className="w-2 h-2 rounded-full bg-red-400" />
        <span className="w-2 h-2 rounded-full bg-yellow-400" />
        <span className="w-2 h-2 rounded-full bg-green-400" />
        <span className="ml-2 text-[hsl(220_15%_55%)]">
          {landing.slug}.propelkap.com
        </span>
      </div>
      <div className="max-h-[600px] overflow-y-auto p-4 space-y-6">
        {filled.map((s) => (
          <PreviewBlock key={s.kind} kind={s.kind} content={s.content} colors={colors} />
        ))}
      </div>
    </div>
  );
}

function PreviewBlock({
  kind,
  content,
  colors,
}: {
  kind: string;
  content: any;
  colors: any;
}) {
  if (kind === "hero") {
    return (
      <section className="space-y-2 pb-3 border-b border-current/10">
        <h1 className="text-base font-bold leading-tight" style={{ color: colors.primary }}>
          {content.headline}
        </h1>
        <p className="opacity-80 leading-snug">{content.subheadline}</p>
        <button
          className="px-3 py-1.5 rounded-md text-[0.65rem] font-semibold mt-1"
          style={{ background: colors.accent, color: colors.primary }}
        >
          {content.cta_text}
        </button>
      </section>
    );
  }
  if (kind === "propuesta_valor") {
    return (
      <section className="space-y-1.5">
        <h2 className="font-semibold" style={{ color: colors.primary }}>
          {content.titulo}
        </h2>
        <p className="opacity-80 leading-snug text-[0.7rem]">{content.parrafo}</p>
      </section>
    );
  }
  if (kind === "beneficios" || kind === "proceso") {
    const arr = content.items ?? content.pasos ?? [];
    return (
      <section className="space-y-2">
        <h2 className="font-semibold" style={{ color: colors.primary }}>
          {content.titulo}
        </h2>
        <ul className="space-y-1.5">
          {arr.map((it: any, i: number) => (
            <li key={i} className="text-[0.7rem]">
              <span className="font-semibold">
                {it.icon ? `${it.icon} ` : `${i + 1}. `}
                {it.titulo}.
              </span>{" "}
              <span className="opacity-70">{it.descripcion}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (kind === "faq") {
    return (
      <section className="space-y-2">
        <h2 className="font-semibold" style={{ color: colors.primary }}>
          {content.titulo}
        </h2>
        <ul className="space-y-1">
          {(content.items ?? []).slice(0, 3).map((q: any, i: number) => (
            <li key={i} className="text-[0.7rem]">
              <span className="font-semibold">{q.pregunta}</span>
              <span className="opacity-60 block">{q.respuesta}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (kind === "cta") {
    return (
      <section
        className="rounded-lg p-3 text-center space-y-2 mt-4"
        style={{ background: colors.primary, color: colors.bg }}
      >
        <h2 className="font-bold text-[0.85rem]">{content.headline}</h2>
        <p className="text-[0.7rem] opacity-90">{content.subheadline}</p>
        <button
          className="px-3 py-1.5 rounded-md text-[0.65rem] font-semibold"
          style={{ background: colors.accent, color: colors.primary }}
        >
          {content.button_text}
        </button>
      </section>
    );
  }
  if (kind === "sobre_mi") {
    return (
      <section className="space-y-1.5">
        <h2 className="font-semibold" style={{ color: colors.primary }}>
          {content.titulo}
        </h2>
        <p className="opacity-80 leading-snug text-[0.7rem]">{content.bio_corta}</p>
      </section>
    );
  }
  return null;
}
