/**
 * POST /api/whatsapp/test-template
 *
 * Envia UNA template Meta-aprobada a UN numero. Util para probar antes
 * de lanzar campañas masivas, o para mandar mensajes one-off a una clienta
 * fuera de la ventana 24h.
 *
 * Body:
 *   {
 *     to: "+528131175672",         // E.164
 *     template: "reactivacion_dormida",
 *     vars: { "1": "María" }        // opcional, defaults a {1: "Cliente"}
 *   }
 */
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";

const TEMPLATE_SID_ENV: Record<string, string> = {
  reactivacion_dormida: "TWILIO_TEMPLATE_REACTIVACION_DORMIDA",
  aviso_retoque_60d: "TWILIO_TEMPLATE_AVISO_RETOQUE_60D",
  aviso_retoque_anual: "TWILIO_TEMPLATE_AVISO_RETOQUE_ANUAL",
  cumpleanos_cupon: "TWILIO_TEMPLATE_CUMPLEANOS_CUPON",
  recordatorio_cita_24h: "TWILIO_TEMPLATE_RECORDATORIO_CITA_24H",
  recordatorio_cita_2h: "TWILIO_TEMPLATE_RECORDATORIO_CITA_2H",
  confirmacion_cita_link_pago: "TWILIO_TEMPLATE_CONFIRMACION_CITA_LINK_PAGO",
  confirmacion_cita_valoracion: "TWILIO_TEMPLATE_CONFIRMACION_CITA_VALORACION",
  pedir_resena_google: "TWILIO_TEMPLATE_PEDIR_RESENA_GOOGLE",
};

export async function POST(req: Request) {
  const sbAuth = await createClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: { to: string; template: string; vars?: Record<string, string> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { to, template, vars = {} } = body;
  if (!to?.trim()) return NextResponse.json({ error: "Falta 'to'" }, { status: 400 });
  if (!template) return NextResponse.json({ error: "Falta 'template'" }, { status: 400 });

  const envName = TEMPLATE_SID_ENV[template];
  if (!envName) {
    return NextResponse.json({
      error: `Template '${template}' no reconocida. Válidas: ${Object.keys(TEMPLATE_SID_ENV).join(", ")}`,
    }, { status: 400 });
  }
  const templateSid = process.env[envName];
  if (!templateSid) {
    return NextResponse.json({
      error: `Env var ${envName} no configurada en este deploy`,
    }, { status: 500 });
  }

  // Defaults razonables para variables comunes
  const defaultVars: Record<string, string> = {
    "1": vars["1"] || "Cliente",
    "2": vars["2"] || "10:00 AM",
    "3": vars["3"] || "microblading",
    "4": vars["4"] || "1500",
    "5": vars["5"] || "https://gina-brows.vercel.app",
  };
  // Solo pasamos las que la template realmente espera (a Twilio le da igual,
  // pero mejor mandar las correctas)
  const templateVars = { ...defaultVars, ...vars };

  const sb = createServiceClient();
  const result = await sendWhatsApp(sb, {
    to,
    templateSid,
    templateVars,
    templateName: template,
  });

  return NextResponse.json({
    ok: result.ok,
    twilio_sid: result.twilioSid,
    estado: result.estado,
    error: result.error,
    template_used: template,
    template_sid: templateSid,
  });
}
