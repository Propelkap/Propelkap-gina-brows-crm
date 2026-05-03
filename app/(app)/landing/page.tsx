/**
 * /landing — Mi Landing Builder
 * Wizard de 8 pasos (1 por sección + 1 de marca + 1 de publicar) impulsado
 * por Claude Haiku 4.5 (más Sonnet ocasional para reescrituras de tono).
 */
import { createClient } from "@/lib/supabase/server";
import LandingBuilderClient from "./_components/LandingBuilderClient";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const sb = await createClient();

  // Cargar landing + secciones (1 sola query bootstrap)
  const { data: landing } = await sb
    .from("pk_landings")
    .select("id, slug, config, status, plan_tier, ai_quota_today, published_at")
    .limit(1)
    .maybeSingle();

  const { data: sections } = await sb
    .from("pk_landing_sections")
    .select("id, kind, position, enabled, content, last_ai_generated_at")
    .order("position", { ascending: true });

  return (
    <div className="max-w-6xl mx-auto py-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Mi Landing</h1>
        <p className="text-sm text-[hsl(220_15%_50%)]">
          Construye tu landing pública sección por sección. Claude te asiste con
          copy en cada paso.
        </p>
      </header>

      <LandingBuilderClient
        initialLanding={landing ?? null}
        initialSections={sections ?? []}
      />
    </div>
  );
}
