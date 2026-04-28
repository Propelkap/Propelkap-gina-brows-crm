import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { comunicacion_id, cliente_id, tipo, mensaje_original, mensaje_corregido, contexto } = body;

  if (!tipo || !["up", "down"].includes(tipo)) {
    return NextResponse.json({ error: "tipo debe ser 'up' o 'down'" }, { status: 400 });
  }

  const { error } = await sb.from("bot_feedback").insert({
    comunicacion_id: comunicacion_id || null,
    cliente_id: cliente_id || null,
    usuario_id: user.id,
    tipo,
    mensaje_original: tipo === "down" ? mensaje_original : null,
    mensaje_corregido: tipo === "down" ? mensaje_corregido : null,
    contexto: contexto || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
