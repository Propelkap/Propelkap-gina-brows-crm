/**
 * Webhook entrante de Twilio WhatsApp.
 *
 * Twilio manda un POST con form-encoded data cada vez que una clienta escribe.
 * Configurar en Twilio Console:
 *   Senders → WhatsApp Senders → tu número → Webhook URL:
 *   https://gina-brows-crm.vercel.app/api/webhooks/whatsapp
 *   Method: POST
 *
 * Flujo:
 * 1. Recibe mensaje, identifica/crea clienta por su WhatsApp
 * 2. Guarda mensaje entrante en `comunicaciones`
 * 3. Si bot NO está pausado → genera respuesta con Claude (voz Gina)
 * 4. Manda respuesta via Twilio + guarda en `comunicaciones`
 * 5. Devuelve TwiML vacío (Twilio espera 200)
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import { generarRespuestaBot } from "@/lib/bot";

export const runtime = "nodejs";

function normPhone(raw: string): string {
  // Twilio manda: 'whatsapp:+528130791032'
  return raw.replace(/^whatsapp:/, "").replace(/[^0-9+]/g, "");
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const from = String(formData.get("From") ?? "");
  const body = String(formData.get("Body") ?? "");
  const profileName = String(formData.get("ProfileName") ?? "");
  const messageSid = String(formData.get("MessageSid") ?? "");
  const numMedia = parseInt(String(formData.get("NumMedia") ?? "0"));

  if (!from || (!body && numMedia === 0)) {
    return NextResponse.json({ ok: true, ignored: "empty message" });
  }

  const sb = createServiceClient();
  const phone = normPhone(from);
  const normalized = phone; // ya viene normalizado

  // 1. Buscar o crear clienta
  let { data: cliente } = await sb
    .from("clientes")
    .select("id, nombre, apellido, bot_pausado")
    .eq("whatsapp_normalizado", normalized)
    .maybeSingle();

  if (!cliente) {
    const { data: nueva } = await sb.from("clientes").insert({
      nombre: profileName || "(sin nombre)",
      whatsapp: phone,
      origen_lead: "whatsapp_directo",
      estado: "lead",
    }).select("id, nombre, apellido, bot_pausado").single();
    cliente = nueva;
  }

  if (!cliente) {
    console.error("No se pudo crear/encontrar cliente para", phone);
    return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // 2. Guardar mensaje entrante
  await sb.from("comunicaciones").insert({
    cliente_id: cliente.id,
    canal: "whatsapp",
    direccion: "entrante",
    cuerpo: body || "[mensaje multimedia]",
    twilio_sid: messageSid,
    estado_entrega: "delivered",
  });

  // 2.b Opt-out: si la clienta escribe STOP / BAJA / NO ESCRIBAN / NO MARKETING /
  //     UNSUBSCRIBE, marca no_marketing=true y NO le respondemos con bot.
  //     El cron de campañas la excluye automaticamente.
  const optOutRegex = /^\s*(stop|baja|alto|cancela|no\s+escrib(an|en|as)|no\s+marketing|unsubscribe|darme?\s+de\s+baja)\b/i;
  if (body && optOutRegex.test(body)) {
    await sb.from("clientes").update({
      no_marketing: true,
      no_marketing_at: new Date().toISOString(),
      no_marketing_motivo: `Auto-opt-out via WhatsApp: "${body.slice(0, 200)}"`,
    }).eq("id", cliente.id);
    console.log(`[opt-out] cliente ${cliente.id} (${phone}) marcado no_marketing por: ${body}`);
    // Confirmacion suave dentro de la ventana 24h (que recien se abrio)
    return new NextResponse(
      `<Response><Message>Listo, te quitamos de los avisos automáticos. Si quieres volver a recibir promociones, solo escríbenos 🌿</Message></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  // 3. Si bot pausado para esta clienta, no responder
  if (cliente.bot_pausado) {
    return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // 4. Generar respuesta con bot IA
  if (!body || numMedia > 0) {
    // Si solo mandó imagen/audio sin texto, NO respondemos (no entendemos contexto)
    return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  try {
    const respBot = await generarRespuestaBot(sb, cliente.id, body);
    if (respBot && respBot.respuesta) {
      // 5. Mandar respuesta
      await sendWhatsApp(sb, {
        to: phone,
        body: respBot.respuesta,
        clienteId: cliente.id,
        templateName: "bot_ia_respuesta",
      });
    }
  } catch (e) {
    console.error("Bot/send error:", e);
    // No fallamos el webhook por esto, Twilio reintentaria
  }

  // Twilio espera respuesta TwiML válida (vacía está bien si ya mandamos via API)
  return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
}
