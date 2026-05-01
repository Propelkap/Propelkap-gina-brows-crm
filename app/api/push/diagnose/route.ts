/**
 * GET /api/push/diagnose
 *
 * Diagnostico de subscripciones push del usuario logueado.
 * Devuelve estado del lado servidor para correlacionar con el browser.
 */
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const sbAuth = await createClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sb = createServiceClient();
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, created_at, last_used_at, failed_count")
    .eq("usuario_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    user_id: user.id,
    user_email: user.email,
    subs_count: subs?.length ?? 0,
    subs: (subs ?? []).map((s) => ({
      id: s.id,
      endpoint_short: s.endpoint.slice(0, 60) + "…",
      provider: s.endpoint.includes("fcm.googleapis") ? "FCM/Chrome"
        : s.endpoint.includes("web.push.apple.com") ? "Apple Push (Safari)"
        : s.endpoint.includes("mozilla") ? "Mozilla (Firefox)"
        : "otro",
      user_agent: s.user_agent?.slice(0, 80),
      created_at: s.created_at,
      last_used_at: s.last_used_at,
      failed_count: s.failed_count,
    })),
    error: error?.message ?? null,
    vapid_public_configured: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    vapid_private_configured: !!process.env.VAPID_PRIVATE_KEY,
  });
}
