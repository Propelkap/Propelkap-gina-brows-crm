/**
 * POST /api/landing/bootstrap
 * Crea la landing inicial + 8 secciones default usando RPC pk_landing_bootstrap.
 * Body: { slug, brand_name, plan_tier? }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { slug: string; brand_name: string; plan_tier?: "mensual" | "anual" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.slug || !body.brand_name) {
    return NextResponse.json(
      { ok: false, error: "slug y brand_name son requeridos" },
      { status: 400 }
    );
  }

  const sb = await createClient();

  // Verificar que NO exista ya una landing
  const { data: existing } = await sb.from("pk_landings").select("id").limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "landing_already_exists · usa /landing para editarla" },
      { status: 409 }
    );
  }

  const { data: landingId, error } = await sb.rpc("pk_landing_bootstrap", {
    _slug: body.slug,
    _brand_name: body.brand_name,
    _plan_tier: body.plan_tier ?? "mensual",
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: `rpc_failed: ${error.message}` },
      { status: 500 }
    );
  }

  // Cargar landing + secciones para devolver
  const { data: landing } = await sb
    .from("pk_landings")
    .select("id, slug, config, status, plan_tier, ai_quota_today, published_at")
    .eq("id", landingId)
    .single();

  const { data: sections } = await sb
    .from("pk_landing_sections")
    .select("id, kind, position, enabled, content, last_ai_generated_at")
    .eq("landing_id", landingId)
    .order("position", { ascending: true });

  return NextResponse.json({ ok: true, landing, sections });
}
