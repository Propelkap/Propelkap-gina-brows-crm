"use client";

import { useState, useTransition, useMemo } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import type {
  SectionKind,
  AiGenerateResponse,
  AiErrorResponse,
} from "@/lib/landing-builder/schema";
import BootstrapPanel from "./BootstrapPanel";
import SectionEditor from "./SectionEditor";
import LandingPreview from "./LandingPreview";
import BrandStep from "./BrandStep";

type Landing = {
  id: string;
  slug: string;
  config: any;
  status: "draft" | "published" | "paused";
  plan_tier: "mensual" | "anual";
  ai_quota_today: number;
  published_at: string | null;
};

type Section = {
  id: string;
  kind: SectionKind;
  position: number;
  enabled: boolean;
  content: any;
  last_ai_generated_at: string | null;
};

const STEPS: { kind: "brand" | SectionKind; label: string }[] = [
  { kind: "brand", label: "Marca" },
  { kind: "hero", label: "Hero" },
  { kind: "propuesta_valor", label: "Propuesta" },
  { kind: "beneficios", label: "Beneficios" },
  { kind: "sobre_mi", label: "Sobre mí" },
  { kind: "proceso", label: "Proceso" },
  { kind: "testimonios", label: "Testimonios" },
  { kind: "faq", label: "FAQ" },
  { kind: "cta", label: "CTA final" },
];

export default function LandingBuilderClient({
  initialLanding,
  initialSections,
}: {
  initialLanding: Landing | null;
  initialSections: Section[];
}) {
  const [landing, setLanding] = useState<Landing | null>(initialLanding);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [stepIdx, setStepIdx] = useState(0);
  const [publishing, setPublishing] = useState<"idle" | "loading" | "ok" | "err">(
    "idle"
  );
  const [publishMsg, setPublishMsg] = useState<string>("");

  const dailyLimit = landing?.plan_tier === "anual" ? 200 : 50;

  if (!landing) {
    return <BootstrapPanel onCreated={(l, s) => { setLanding(l); setSections(s); }} />;
  }

  const currentStep = STEPS[stepIdx];
  const currentSection =
    currentStep.kind === "brand"
      ? null
      : sections.find((s) => s.kind === currentStep.kind);

  const onSectionUpdated = (updated: Section) => {
    setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };
  const onLandingUpdated = (updated: Partial<Landing>) => {
    setLanding((prev) => (prev ? { ...prev, ...updated } : prev));
  };

  const onPublish = async () => {
    setPublishing("loading");
    setPublishMsg("");
    try {
      const r = await fetch("/api/landing/publish", { method: "POST" });
      const data = await r.json();
      if (data.ok) {
        setPublishing("ok");
        setPublishMsg(data.public_url ?? "");
        setLanding((p) => p ? { ...p, status: "published", published_at: new Date().toISOString() } : p);
      } else {
        setPublishing("err");
        setPublishMsg(data.error ?? "error desconocido");
      }
    } catch (err) {
      setPublishing("err");
      setPublishMsg((err as Error).message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_minmax(0,400px)] gap-6">
      {/* Sidebar con steps */}
      <aside className="space-y-1.5">
        {STEPS.map((step, idx) => {
          const isActive = idx === stepIdx;
          const section =
            step.kind === "brand"
              ? null
              : sections.find((s) => s.kind === step.kind);
          const isFilled =
            step.kind === "brand"
              ? !!landing.config?.brand_name
              : section && Object.keys(section.content ?? {}).length > 0;

          return (
            <button
              key={step.kind}
              onClick={() => setStepIdx(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                isActive
                  ? "bg-[var(--lime)] text-[var(--navy-deep)] font-semibold"
                  : "hover:bg-[var(--muted)] text-[var(--foreground)]"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isFilled
                    ? "bg-[var(--navy-deep)] text-[var(--lime)]"
                    : "bg-[var(--border)] text-[hsl(220_15%_50%)]"
                }`}
              >
                {isFilled ? <Check className="w-3 h-3" /> : idx + 1}
              </span>
              <span>{step.label}</span>
            </button>
          );
        })}

        {/* Publish CTA */}
        <div className="pt-4 mt-4 border-t border-[var(--border)]">
          <button
            onClick={onPublish}
            disabled={publishing === "loading"}
            className="w-full bg-[var(--navy-deep)] text-[var(--lime)] py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {publishing === "loading" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {landing.status === "published" ? "Republicar" : "Publicar landing"}
          </button>
          {publishing === "ok" && (
            <a
              href={publishMsg}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center gap-2 text-xs text-[var(--navy-deep)] hover:text-[var(--navy-soft)] underline break-all"
            >
              <ExternalLink className="w-3 h-3" />
              {publishMsg}
            </a>
          )}
          {publishing === "err" && (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-500">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{publishMsg}</span>
            </div>
          )}
          <p className="text-[0.65rem] text-[hsl(220_15%_55%)] mt-3">
            Cuota IA hoy: {landing.ai_quota_today}/{dailyLimit} · Plan{" "}
            {landing.plan_tier}
          </p>
        </div>
      </aside>

      {/* Editor central */}
      <main>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="text-sm text-[hsl(220_15%_50%)] flex items-center gap-1 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <span className="text-xs text-[hsl(220_15%_55%)]">
            Paso {stepIdx + 1} de {STEPS.length}
          </span>
          <button
            onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
            disabled={stepIdx === STEPS.length - 1}
            className="text-sm text-[hsl(220_15%_50%)] flex items-center gap-1 disabled:opacity-40"
          >
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {currentStep.kind === "brand" ? (
          <BrandStep landing={landing} onUpdated={onLandingUpdated} />
        ) : currentSection ? (
          <SectionEditor
            landingId={landing.id}
            section={currentSection}
            onUpdated={onSectionUpdated}
          />
        ) : null}
      </main>

      {/* Preview */}
      <aside className="hidden lg:block">
        <div className="sticky top-6">
          <p className="text-xs uppercase tracking-wider text-[hsl(220_15%_55%)] mb-2">
            Vista previa
          </p>
          <LandingPreview landing={landing} sections={sections} />
        </div>
      </aside>
    </div>
  );
}
