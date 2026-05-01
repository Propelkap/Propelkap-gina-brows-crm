/**
 * Cron diario · 9 AM Monterrey (15:00 UTC)
 *
 * Tareas:
 *  1. Recordatorios 24h: WhatsApp a clientas con cita mañana (estado
 *     tentativa o confirmada). Template: recordatorio_cita_24h.
 *  2. Aviso retoque 60d: clientas con microblading hace 50-65 dias sin
 *     retoque agendado. Template: aviso_retoque_60d.
 *  3. Aviso retoque anual: clientas con microblading hace 350-380 dias
 *     sin retoque anual. Template: aviso_retoque_anual.
 *  4. Cumpleanos: clientas que cumplen anos hoy. Template: cumpleanos_cupon.
 *
 * Idempotencia: cada bloque usa `yaSeMandoTemplate` para no duplicar
 * envios si el cron se dispara dos veces el mismo dia.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import {
  assertCronAuth,
  todayYmdMX,
  addDaysYmd,
  mxDayRange,
  todayMonthDayMX,
  yaSeMandoTemplate,
  fmtHoraMX,
  toE164,
} from "@/lib/cron-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const sb = createServiceClient();
  const stats = {
    recordatorios_24h: { sent: 0, skipped: 0, failed: 0 },
    retoque_60d: { sent: 0, skipped: 0, failed: 0 },
    retoque_anual: { sent: 0, skipped: 0, failed: 0 },
    cumpleanos: { sent: 0, skipped: 0, failed: 0 },
    errors: [] as string[],
  };

  // ===== 1. RECORDATORIOS 24h =====
  // Citas que comienzan mañana (00:00 a 23:59 MX), no canceladas/no_show.
  try {
    const tomorrowYmd = addDaysYmd(todayYmdMX(), 1);
    const { start, end } = mxDayRange(tomorrowYmd);
    const { data: citas, error } = await sb
      .from("citas")
      .select("id, inicio, cliente:clientes(id, nombre, whatsapp), servicio:servicios(nombre)")
      .gte("inicio", start)
      .lt("inicio", end)
      .in("estado", ["tentativa", "confirmada"])
      .order("inicio");
    if (error) throw error;

    for (const c of (citas ?? []) as any[]) {
      const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
      const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio;
      const wa = toE164(cliente?.whatsapp);
      if (!wa) { stats.recordatorios_24h.skipped++; continue; }

      if (await yaSeMandoTemplate(sb, "recordatorio_cita_24h", { citaId: c.id })) {
        stats.recordatorios_24h.skipped++;
        continue;
      }

      const r = await sendWhatsApp(sb, {
        to: wa,
        templateSid: process.env.TWILIO_TEMPLATE_RECORDATORIO_CITA_24H,
        templateVars: {
          "1": cliente?.nombre ?? "",
          "2": fmtHoraMX(c.inicio),
          "3": servicio?.nombre ?? "tu cita",
        },
        templateName: "recordatorio_cita_24h",
        clienteId: cliente?.id,
        citaId: c.id,
      });
      if (r.ok) stats.recordatorios_24h.sent++;
      else { stats.recordatorios_24h.failed++; stats.errors.push(`24h ${c.id}: ${r.error}`); }
    }
  } catch (e) {
    stats.errors.push(`recordatorios_24h fatal: ${(e as Error).message}`);
  }

  // ===== 2. AVISO RETOQUE 60d =====
  // Clientas con cita microblading completada hace 50-65 dias, sin
  // retoque agendado en los proximos 30 dias, sin aviso enviado.
  try {
    const hoyYmd = todayYmdMX();
    const desde = addDaysYmd(hoyYmd, -65);
    const hasta = addDaysYmd(hoyYmd, -50);
    const desdeISO = `${desde}T00:00:00-06:00`;
    const hastaISO = `${hasta}T00:00:00-06:00`;

    const { data: candidatas, error } = await sb
      .from("citas")
      .select("id, inicio, cliente_id, cliente:clientes(id, nombre, whatsapp), servicio:servicios(nombre, retoque_dias_obligatorio)")
      .gte("inicio", desdeISO)
      .lt("inicio", hastaISO)
      .eq("estado", "completada");
    if (error) throw error;

    // Filtra solo las que el servicio requiere retoque (microblading, etc.)
    for (const c of (candidatas ?? []) as any[]) {
      const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
      const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio;
      if (!servicio?.retoque_dias_obligatorio) { stats.retoque_60d.skipped++; continue; }
      const wa = toE164(cliente?.whatsapp);
      if (!wa) { stats.retoque_60d.skipped++; continue; }

      // Idempotencia por cliente: una vez al ciclo
      const desdeAvisoISO = addDaysYmd(hoyYmd, -90) + "T00:00:00-06:00";
      if (await yaSeMandoTemplate(sb, "aviso_retoque_60d", { clienteId: cliente.id, desdeISO: desdeAvisoISO })) {
        stats.retoque_60d.skipped++;
        continue;
      }

      // Skip si la clienta ya tiene cita futura agendada
      const futuroISO = `${hoyYmd}T00:00:00-06:00`;
      const limiteISO = `${addDaysYmd(hoyYmd, 30)}T00:00:00-06:00`;
      const { count: citasFuturas } = await sb
        .from("citas")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", cliente.id)
        .gte("inicio", futuroISO)
        .lt("inicio", limiteISO)
        .in("estado", ["tentativa", "confirmada"]);
      if ((citasFuturas ?? 0) > 0) { stats.retoque_60d.skipped++; continue; }

      const r = await sendWhatsApp(sb, {
        to: wa,
        templateSid: process.env.TWILIO_TEMPLATE_AVISO_RETOQUE_60D,
        templateVars: { "1": cliente.nombre ?? "" },
        templateName: "aviso_retoque_60d",
        clienteId: cliente.id,
      });
      if (r.ok) stats.retoque_60d.sent++;
      else { stats.retoque_60d.failed++; stats.errors.push(`retoque60d ${cliente.id}: ${r.error}`); }
    }
  } catch (e) {
    stats.errors.push(`retoque_60d fatal: ${(e as Error).message}`);
  }

  // ===== 3. AVISO RETOQUE ANUAL =====
  // Cita microblading hace 350-380 dias, sin retoque anual en el ultimo ano.
  try {
    const hoyYmd = todayYmdMX();
    const desde = addDaysYmd(hoyYmd, -380);
    const hasta = addDaysYmd(hoyYmd, -350);
    const desdeISO = `${desde}T00:00:00-06:00`;
    const hastaISO = `${hasta}T00:00:00-06:00`;

    const { data: candidatas, error } = await sb
      .from("citas")
      .select("id, inicio, cliente_id, cliente:clientes(id, nombre, whatsapp), servicio:servicios(nombre, retoque_anual_dias)")
      .gte("inicio", desdeISO)
      .lt("inicio", hastaISO)
      .eq("estado", "completada");
    if (error) throw error;

    for (const c of (candidatas ?? []) as any[]) {
      const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
      const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio;
      if (!servicio?.retoque_anual_dias) { stats.retoque_anual.skipped++; continue; }
      const wa = toE164(cliente?.whatsapp);
      if (!wa) { stats.retoque_anual.skipped++; continue; }

      const desdeAvisoISO = addDaysYmd(hoyYmd, -180) + "T00:00:00-06:00";
      if (await yaSeMandoTemplate(sb, "aviso_retoque_anual", { clienteId: cliente.id, desdeISO: desdeAvisoISO })) {
        stats.retoque_anual.skipped++;
        continue;
      }

      const r = await sendWhatsApp(sb, {
        to: wa,
        templateSid: process.env.TWILIO_TEMPLATE_AVISO_RETOQUE_ANUAL,
        templateVars: { "1": cliente.nombre ?? "" },
        templateName: "aviso_retoque_anual",
        clienteId: cliente.id,
      });
      if (r.ok) stats.retoque_anual.sent++;
      else { stats.retoque_anual.failed++; stats.errors.push(`retoqueAnual ${cliente.id}: ${r.error}`); }
    }
  } catch (e) {
    stats.errors.push(`retoque_anual fatal: ${(e as Error).message}`);
  }

  // ===== 4. CUMPLEANOS =====
  try {
    const monthDay = todayMonthDayMX(); // "MM-DD"

    const { data: clientas, error } = await sb
      .from("clientes")
      .select("id, nombre, whatsapp, fecha_nacimiento")
      .eq("archivada", false)
      .not("fecha_nacimiento", "is", null);
    if (error) throw error;

    const desdeAvisoISO = addDaysYmd(todayYmdMX(), -300) + "T00:00:00-06:00";

    for (const cl of clientas ?? []) {
      if (!cl.fecha_nacimiento) continue;
      // fecha_nacimiento es 'YYYY-MM-DD'; comparamos solo MM-DD
      if (cl.fecha_nacimiento.slice(5, 10) !== monthDay) continue;
      const wa = toE164(cl.whatsapp);
      if (!wa) { stats.cumpleanos.skipped++; continue; }
      if (await yaSeMandoTemplate(sb, "cumpleanos_cupon", { clienteId: cl.id, desdeISO: desdeAvisoISO })) {
        stats.cumpleanos.skipped++;
        continue;
      }

      const r = await sendWhatsApp(sb, {
        to: wa,
        templateSid: process.env.TWILIO_TEMPLATE_CUMPLEANOS_CUPON,
        templateVars: { "1": cl.nombre ?? "" },
        templateName: "cumpleanos_cupon",
        clienteId: cl.id,
      });
      if (r.ok) stats.cumpleanos.sent++;
      else { stats.cumpleanos.failed++; stats.errors.push(`cumple ${cl.id}: ${r.error}`); }
    }
  } catch (e) {
    stats.errors.push(`cumpleanos fatal: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString(), stats });
}
