/**
 * Cron diario · 8 AM Monterrey (14:00 UTC).
 *
 * Pide reseña de Google a clientas con cita completada hace ~24h.
 * Ventana: citas que terminaron entre 24h y 48h atras (yesterday MX),
 * sin aviso enviado.
 *
 * El link de Google se toma de NEXT_PUBLIC_GOOGLE_REVIEW_URL si esta
 * configurado, sino usa una URL placeholder de fallback.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import {
  assertCronAuth,
  todayYmdMX,
  addDaysYmd,
  mxDayRange,
  yaSeMandoTemplate,
  toE164,
} from "@/lib/cron-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const sb = createServiceClient();
  const stats = { sent: 0, skipped: 0, failed: 0, errors: [] as string[] };

  const reviewUrl = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL
    ?? "https://g.page/r/CWEXn5HKQXxtEAI/review"; // placeholder Gina Brows

  // Citas que terminaron AYER (en MX) — ventana day range [-1, 0)
  const ayerYmd = addDaysYmd(todayYmdMX(), -1);
  const { start, end } = mxDayRange(ayerYmd);

  const { data: citas, error } = await sb
    .from("citas")
    .select("id, inicio, cliente:clientes(id, nombre, whatsapp)")
    .gte("inicio", start)
    .lt("inicio", end)
    .eq("estado", "completada");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  for (const c of (citas ?? []) as any[]) {
    const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
    const wa = toE164(cliente?.whatsapp);
    if (!wa) { stats.skipped++; continue; }

    // No volver a pedir resena al mismo cliente en los ultimos 90 dias
    const desdeAvisoISO = addDaysYmd(todayYmdMX(), -90) + "T00:00:00-06:00";
    if (await yaSeMandoTemplate(sb, "pedir_resena_google", { clienteId: cliente.id, desdeISO: desdeAvisoISO })) {
      stats.skipped++;
      continue;
    }

    const r = await sendWhatsApp(sb, {
      to: wa,
      templateSid: process.env.TWILIO_TEMPLATE_PEDIR_RESENA_GOOGLE,
      templateVars: { "1": cliente.nombre ?? "", "2": reviewUrl },
      templateName: "pedir_resena_google",
      clienteId: cliente.id,
      citaId: c.id,
    });
    if (r.ok) stats.sent++;
    else { stats.failed++; stats.errors.push(`${c.id}: ${r.error}`); }
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString(), stats });
}
