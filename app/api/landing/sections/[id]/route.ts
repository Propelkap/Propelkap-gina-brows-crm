/**
 * PATCH /api/landing/sections/[id]
 * Actualiza el contenido de una sección manualmente (sin AI).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const sb = await createClient();
  const update: Record<string, unknown> = {};
  if (body.content !== undefined) update.content = body.content;
  if (body.enabled !== undefined) update.enabled = body.enabled;
  if (body.position !== undefined) update.position = body.position;

  const { error } = await sb.from("pk_landing_sections").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
