/**
 * PATCH /api/landing/config
 * Actualiza pk_landings.config (la única landing del cliente).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const sb = await createClient();
  const { data: landing } = await sb.from("pk_landings").select("id").limit(1).single();
  if (!landing) {
    return NextResponse.json({ ok: false, error: "landing_not_found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (body.config !== undefined) update.config = body.config;
  if (body.domain !== undefined) update.domain = body.domain;

  const { error } = await sb.from("pk_landings").update(update).eq("id", landing.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
