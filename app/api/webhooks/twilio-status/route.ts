/**
 * Webhook de Twilio: status callback de mensajes WhatsApp salientes.
 *
 * Twilio dispara este endpoint cada vez que un mensaje cambia de estado:
 *   queued → sending → sent → delivered → read       (caso feliz)
 *   queued → sending → undelivered                   (numero invalido)
 *   queued → failed                                  (error de Twilio)
 *
 * El statusCallback URL se inyecta en cada mensaje desde lib/whatsapp.ts
 * (no requiere configuracion manual en Twilio Console).
 *
 * Validacion: comparamos el AccountSid del payload contra el de env.
 * Twilio firma con HMAC pero JP/Gina ya tiene SKIP_SIGNATURE en el otro
 * webhook por incompatibilidad documentada con WhatsApp; mismo enfoque
 * defensive aqui.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let form: URLSearchParams;
  try {
    const text = await req.text();
    form = new URLSearchParams(text);
  } catch {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }

  const accountSid = form.get("AccountSid");
  const messageSid = form.get("MessageSid") ?? form.get("SmsSid");
  const status = form.get("MessageStatus") ?? form.get("SmsStatus");
  const errorCode = form.get("ErrorCode") || null;
  const errorMessage = form.get("ErrorMessage") || null;
  const to = form.get("To") || null;

  // Defense-in-depth: descarta callbacks de cuentas distintas a la nuestra
  const expectedSid = process.env.TWILIO_ACCOUNT_SID;
  if (expectedSid && accountSid && accountSid !== expectedSid) {
    return NextResponse.json({ error: "AccountSid mismatch" }, { status: 401 });
  }

  if (!messageSid || !status) {
    // Twilio espera 2xx aunque no procesemos, pero loguea
    console.warn("twilio-status: payload incompleto", { messageSid, status });
    return new NextResponse("ok", { status: 200 });
  }

  const sb = createServiceClient();

  // Update por twilio_sid; si no encontramos el row, no es fatal
  // (puede ser un mensaje fuera de nuestro CRM o un retry tardio).
  const updates: Record<string, unknown> = {
    estado_entrega: status,
  };
  if (errorCode || errorMessage) {
    updates.error_codigo = errorCode;
    updates.error_mensaje = errorMessage;
  }

  const { error, count } = await sb
    .from("comunicaciones")
    .update(updates, { count: "exact" })
    .eq("twilio_sid", messageSid);

  if (error) {
    console.error("twilio-status update error:", error.message, { messageSid, status });
    // No 500 — si tiramos error, Twilio reintenta. Mejor 200 + log.
  }

  // Si el mensaje fue undelivered/failed por numero invalido, podriamos
  // marcar el cliente.whatsapp como sospechoso. Por ahora solo log.
  if (status === "undelivered" || status === "failed") {
    console.warn(`twilio-status: ${messageSid} ${status} → ${to}`, { errorCode, errorMessage });
  }

  return new NextResponse("ok", {
    status: 200,
    headers: { "x-matched-rows": String(count ?? 0) },
  });
}
