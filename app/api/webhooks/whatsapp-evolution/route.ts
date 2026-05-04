import { NextResponse } from "next/server";
import { adminSb, hasSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook receiver de Evolution API.
 *
 * Eventos esperados (según `events` configurados en setInstanceWebhook):
 *  - MESSAGES_UPSERT  → mensaje nuevo (incoming u outgoing).
 *  - CONNECTION_UPDATE → cambia el estado de conexión.
 *  - QRCODE_UPDATED   → QR refrescado (no actuamos hoy).
 *
 * Estructura genérica del body:
 *   { event, instance, data, ... }
 *
 * Persistimos en `whatsapp_connections` y `whatsapp_messages`.
 */
export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const event: string = body?.event ?? "";
  const instance: string = body?.instance ?? body?.instanceName ?? "";
  const data = body?.data;

  // Log liviano para debugging — visible en Vercel logs
  console.log(`[wa-webhook] event=${event} instance=${instance}`);

  if (!hasSupabase()) {
    // En modo demo sin Supabase aceptamos el webhook pero no persistimos
    return NextResponse.json({ ok: true, persisted: false });
  }

  const sb = adminSb();

  try {
    switch (event) {
      case "connection.update":
      case "CONNECTION_UPDATE": {
        const state: string = data?.state ?? data?.status ?? "close";
        const phone: string | null =
          (data?.wuid && String(data.wuid).split("@")[0]) ||
          (data?.ownerJid && String(data.ownerJid).split("@")[0]) ||
          null;
        const profileName: string | null = data?.profileName ?? null;

        await sb.from("whatsapp_connections").upsert({
          instance_name: instance,
          state,
          phone,
          profile_name: profileName,
          last_event_at: new Date().toISOString(),
        });
        break;
      }

      case "messages.upsert":
      case "MESSAGES_UPSERT": {
        // data puede venir como objeto único o array; normalizamos
        const items = Array.isArray(data) ? data : data ? [data] : [];
        for (const m of items) {
          const key = m?.key ?? {};
          const fromMe: boolean = !!key.fromMe;
          const remoteJid: string | null = key.remoteJid ?? null;
          const messageId: string | null = key.id ?? null;
          const ownerJid: string | null = m?.owner ?? null;

          const direction = fromMe ? "out" : "in";
          const fromJid = fromMe ? ownerJid : remoteJid;
          const toJid = fromMe ? remoteJid : ownerJid;

          // Extraer texto. Evolution puede entregar varios shapes.
          const msg = m?.message ?? {};
          const content: string | null =
            msg?.conversation ??
            msg?.extendedTextMessage?.text ??
            msg?.imageMessage?.caption ??
            msg?.videoMessage?.caption ??
            null;

          const messageType: string =
            (msg?.conversation && "text") ||
            (msg?.extendedTextMessage && "text") ||
            (msg?.imageMessage && "image") ||
            (msg?.videoMessage && "video") ||
            (msg?.audioMessage && "audio") ||
            (msg?.documentMessage && "document") ||
            "unknown";

          const { error: upsertErr } = await sb
            .from("whatsapp_messages")
            .upsert(
              {
                instance_name: instance,
                message_id: messageId,
                from_jid: fromJid,
                to_jid: toJid,
                direction,
                content,
                message_type: messageType,
                raw: m,
                ts: m?.messageTimestamp
                  ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
                  : new Date().toISOString(),
              },
              { onConflict: "instance_name,message_id", ignoreDuplicates: true }
            );
          if (upsertErr) {
            console.error("[wa-webhook] upsert error:", upsertErr.message);
          }
        }
        break;
      }

      case "qrcode.updated":
      case "QRCODE_UPDATED":
        // No-op — el frontend ya polea status y el QR vive solo en la sesión activa
        break;

      default:
        // Otros eventos los logueamos pero no persistimos
        console.log(`[wa-webhook] unhandled event: ${event}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[wa-webhook] error:", (e as Error).message);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

// GET handler para que Evolution pueda hacer health check (o nosotros desde browser)
export async function GET() {
  return NextResponse.json({ ok: true, name: "whatsapp-webhook" });
}
