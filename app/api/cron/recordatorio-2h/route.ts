/**
 * Cron horario · cada hora exacta (XX:00 UTC).
 *
 * Manda recordatorios 2h antes de la cita. Toma citas que comienzan
 * en la ventana [+90min, +150min] desde ahora, no canceladas/no_show,
 * y que aun no tengan recordatorio enviado.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import {
  assertCronAuth,
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
  const now = new Date();
  const desde = new Date(now.getTime() + 90 * 60_000).toISOString();   // +90 min
  const hasta = new Date(now.getTime() + 150 * 60_000).toISOString();  // +150 min

  const stats = { sent: 0, skipped: 0, failed: 0, errors: [] as string[] };

  const { data: citas, error } = await sb
    .from("citas")
    .select("id, inicio, cliente:clientes(id, nombre, whatsapp), servicio:servicios(nombre)")
    .gte("inicio", desde)
    .lt("inicio", hasta)
    .in("estado", ["tentativa", "confirmada"]);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  for (const c of (citas ?? []) as any[]) {
    const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
    const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio;
    const wa = toE164(cliente?.whatsapp);
    if (!wa) { stats.skipped++; continue; }

    if (await yaSeMandoTemplate(sb, "recordatorio_cita_2h", { citaId: c.id })) {
      stats.skipped++;
      continue;
    }

    const r = await sendWhatsApp(sb, {
      to: wa,
      templateSid: process.env.TWILIO_TEMPLATE_RECORDATORIO_CITA_2H,
      templateVars: {
        "1": cliente?.nombre ?? "",
        "2": servicio?.nombre ?? "tu cita",
      },
      templateName: "recordatorio_cita_2h",
      clienteId: cliente?.id,
      citaId: c.id,
    });
    if (r.ok) stats.sent++;
    else { stats.failed++; stats.errors.push(`${c.id}: ${r.error}`); }
  }

  return NextResponse.json({ ok: true, ts: now.toISOString(), stats });
}
