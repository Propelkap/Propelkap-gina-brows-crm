import { NextResponse } from "next/server";
import { sendTextMessage, INSTANCE_NAME, getInstanceStatus } from "@/lib/evolution";
import { adminSb, hasSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manda un mensaje de texto a `jid` (puede traer @s.whatsapp.net o solo número).
 *
 * Importante: Evolution v2.3.7 NO dispara MESSAGES_UPSERT para mensajes
 * salientes mandados via API. Persistimos el mensaje a Supabase directamente
 * acá para que aparezca en el hilo del CRM. Si en el futuro Evolution
 * empezara a disparar el webhook de outgoing, el unique constraint
 * (instance_name, message_id) deduplica.
 */
export async function POST(req: Request) {
  let body: { jid?: string; text?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const jid = body.jid?.trim() ?? "";
  const text = body.text?.trim() ?? "";

  if (!jid) return NextResponse.json({ ok: false, error: "Falta jid" }, { status: 400 });
  if (!text) return NextResponse.json({ ok: false, error: "Mensaje vacío" }, { status: 400 });
  if (text.length > 4000)
    return NextResponse.json({ ok: false, error: "Mensaje muy largo" }, { status: 400 });

  const number = jid.split("@")[0] ?? jid;
  const remoteJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;

  try {
    const result = await sendTextMessage(INSTANCE_NAME, number, text);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }

    // Persistir el mensaje saliente. Necesitamos el ownerJid (nuestro propio
    // número) para llenar from_jid; lo obtenemos del estado de la instancia.
    if (hasSupabase()) {
      let ownerJid: string | null = null;
      try {
        const status = await getInstanceStatus(INSTANCE_NAME);
        if (status.phone) ownerJid = `${status.phone}@s.whatsapp.net`;
      } catch {}

      const sb = adminSb();
      const { error: insErr } = await sb
        .from("whatsapp_messages")
        .upsert(
          {
            instance_name: INSTANCE_NAME,
            message_id: result.messageId ?? null,
            from_jid: ownerJid,
            to_jid: remoteJid,
            direction: "out",
            content: text,
            message_type: "text",
            raw: { sentVia: "api", text },
            ts: new Date().toISOString(),
          },
          { onConflict: "instance_name,message_id", ignoreDuplicates: true }
        );
      if (insErr) {
        console.error("[wa-send] persist error:", insErr.message);
      }
    }

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
