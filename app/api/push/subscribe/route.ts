/**
 * POST /api/push/subscribe
 * Registra una PushSubscription del navegador del usuario logueado.
 * Si ya existe (mismo endpoint), actualiza keys + last_used_at.
 *
 * DELETE /api/push/subscribe?endpoint=...
 * Desuscribe (al cerrar sesion o cuando el usuario lo apaga).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string;
};

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Falta endpoint/keys" }, { status: 400 });
  }

  // Upsert por endpoint
  const { error } = await sb
    .from("push_subscriptions")
    .upsert(
      {
        usuario_id: user.id,
        endpoint: body.endpoint,
        keys: body.keys,
        user_agent: body.user_agent || null,
        last_used_at: new Date().toISOString(),
        failed_count: 0,
      },
      { onConflict: "endpoint" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Falta endpoint" }, { status: 400 });

  await sb.from("push_subscriptions").delete()
    .eq("usuario_id", user.id)
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
