/**
 * Helper para mandar mensajes WhatsApp via Twilio Business API.
 * Usa Messaging Service si está configurado (mejor para sender pools / failover),
 * si no usa el número directo en TWILIO_WHATSAPP_FROM.
 */
import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";

type SendOpts = {
  to: string;                // E.164: '+528130791032'
  body?: string;             // Solo para sesión activa (24h)
  templateSid?: string;      // Content SID de Twilio si usa template Meta-aprobado
  templateVars?: Record<string, string>; // ej {"1": "Karina"}
  clienteId?: string;        // para registrar en `comunicaciones`
  campaniaId?: string;
  templateName?: string;
  citaId?: string;
};

export type SendResult = {
  ok: boolean;
  twilioSid?: string;
  error?: string;
  estado?: string;
};

function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

function toE164ToWa(num: string): string {
  const clean = num.replace(/[^0-9+]/g, "");
  return `whatsapp:${clean.startsWith("+") ? clean : `+${clean}`}`;
}

export async function sendWhatsApp(sb: SupabaseClient, opts: SendOpts): Promise<SendResult> {
  const client = twilioClient();
  if (!client) {
    // Modo simulación: solo registrar en BD
    if (opts.clienteId && opts.body) {
      await sb.from("comunicaciones").insert({
        cliente_id: opts.clienteId,
        canal: "whatsapp",
        direccion: "saliente",
        cuerpo: opts.body,
        template_usado: opts.templateName || null,
        campania_id: opts.campaniaId || null,
        cita_id: opts.citaId || null,
        estado_entrega: "simulado",
      });
    }
    return { ok: true, estado: "simulado" };
  }

  const from = process.env.TWILIO_WHATSAPP_FROM!; // 'whatsapp:+52...' o solo '+52...'
  const fromAddr = from.startsWith("whatsapp:") ? from : toE164ToWa(from);
  const toAddr = toE164ToWa(opts.to);
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  try {
    const messageOpts: Record<string, unknown> = {
      to: toAddr,
    };
    if (messagingServiceSid) {
      messageOpts.messagingServiceSid = messagingServiceSid;
    } else {
      messageOpts.from = fromAddr;
    }

    if (opts.templateSid) {
      messageOpts.contentSid = opts.templateSid;
      if (opts.templateVars) {
        messageOpts.contentVariables = JSON.stringify(opts.templateVars);
      }
    } else if (opts.body) {
      messageOpts.body = opts.body;
    } else {
      return { ok: false, error: "Falta body o templateSid" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await client.messages.create(messageOpts as any);

    if (opts.clienteId) {
      await sb.from("comunicaciones").insert({
        cliente_id: opts.clienteId,
        canal: "whatsapp",
        direccion: "saliente",
        cuerpo: opts.body || `[template ${opts.templateName ?? opts.templateSid}]`,
        template_usado: opts.templateName || null,
        twilio_sid: msg.sid,
        campania_id: opts.campaniaId || null,
        cita_id: opts.citaId || null,
        estado_entrega: msg.status, // queued | sending | sent | delivered | undelivered | failed
        variables: opts.templateVars ?? null,
      });
    }

    return { ok: true, twilioSid: msg.sid, estado: msg.status };
  } catch (e) {
    const error = e as Error;
    if (opts.clienteId) {
      await sb.from("comunicaciones").insert({
        cliente_id: opts.clienteId,
        canal: "whatsapp",
        direccion: "saliente",
        cuerpo: opts.body || "",
        template_usado: opts.templateName || null,
        campania_id: opts.campaniaId || null,
        cita_id: opts.citaId || null,
        estado_entrega: "failed",
      });
    }
    return { ok: false, error: error.message };
  }
}

/** Aplica variables {{nombre}} {{cupon}} etc. a un template de texto */
export function aplicarVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
