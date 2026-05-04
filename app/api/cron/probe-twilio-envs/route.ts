/**
 * Endpoint temporal de diagnóstico: revela los TWILIO_TEMPLATE_* SIDs que
 * el runtime de Vercel está usando, para correlacionar con los SIDs reales
 * en Twilio Content. Solo accesible con CRON_SECRET. Borrar después.
 */
import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const tpls = [
    "RECORDATORIO_CITA_24H",
    "RECORDATORIO_CITA_2H",
    "CONFIRMACION_CITA_LINK_PAGO",
    "CONFIRMACION_CITA_VALORACION",
    "PRESENTACION_GINA_BROWS",
    "AVISO_RETOQUE_60D",
    "AVISO_RETOQUE_ANUAL",
    "CUMPLEANOS_CUPON",
    "REACTIVACION_DORMIDA",
    "PEDIR_RESENA_GOOGLE",
  ];
  const out: Record<string, string | undefined> = {};
  for (const t of tpls) {
    const k = `TWILIO_TEMPLATE_${t}`;
    out[k] = process.env[k];
  }
  out["TWILIO_ACCOUNT_SID_prefix"] = process.env.TWILIO_ACCOUNT_SID?.slice(0, 8);
  out["TWILIO_WHATSAPP_FROM"] = process.env.TWILIO_WHATSAPP_FROM;
  return NextResponse.json(out);
}
