/**
 * POST /api/notif/intake-completado
 *
 * Webhook que el form externo de intake (gina-brows.vercel.app) puede
 * llamar cuando una clienta nueva completa el cuestionario. Manda push
 * a TODOS los usuarios suscritos del CRM (Gina + JP).
 *
 * Auth: header `x-intake-secret` debe matchear INTAKE_WEBHOOK_SECRET en
 * env. Es el mismo flujo que CRON_SECRET para Vercel Crons.
 *
 * Body esperado:
 *   { nombre: "María", whatsapp: "+528123456789", servicio_interes?: "..." }
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = req.headers.get("x-intake-secret");
  const expected = process.env.INTAKE_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "INTAKE_WEBHOOK_SECRET no configurado" }, { status: 500 });
  }
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { nombre?: string; whatsapp?: string; servicio_interes?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const sb = createServiceClient();
  const titulo = "🌿 Nueva clienta interesada";
  const cuerpo = body.nombre
    ? `${body.nombre}${body.servicio_interes ? ` — ${body.servicio_interes}` : ""}`
    : "Una clienta acaba de completar el formulario.";

  const result = await sendPush(sb, { toAll: true }, {
    title: titulo,
    body: cuerpo,
    url: "/clientas",
    tag: "intake-nuevo",
  });

  return NextResponse.json({ ok: true, ...result });
}
