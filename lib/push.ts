/**
 * Web Push helpers — manda notificaciones push a las suscripciones
 * guardadas en push_subscriptions. Limpia automaticamente las que
 * el servidor de push retorna como Gone (410).
 */
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:hola@ginabrows.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
};

export type PushTarget = { usuarioId?: string; toAll?: boolean };

export async function sendPush(
  sb: SupabaseClient,
  target: PushTarget,
  payload: PushPayload
): Promise<{ sent: number; removed: number; failed: number }> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("sendPush: VAPID keys no configuradas, skip");
    return { sent: 0, removed: 0, failed: 0 };
  }

  let q = sb.from("push_subscriptions").select("id, endpoint, keys, usuario_id");
  if (target.usuarioId) q = q.eq("usuario_id", target.usuarioId);
  // toAll = true → no filtrar
  const { data: subs, error } = await q;
  if (error || !subs?.length) return { sent: 0, removed: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0, removed = 0, failed = 0;

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
        body,
        { TTL: 60 * 60 * 24 } // 24h
      );
      sent++;
      await sb.from("push_subscriptions").update({ last_used_at: new Date().toISOString(), failed_count: 0 }).eq("id", s.id);
    } catch (e: any) {
      // 404/410 = subscription expirada o cancelada → borrar
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await sb.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else {
        failed++;
        await sb.from("push_subscriptions")
          .update({ failed_count: ((s as any).failed_count ?? 0) + 1 })
          .eq("id", s.id);
        console.warn(`push fail ${s.endpoint.slice(0, 60)}…: ${e?.message}`);
      }
    }
  }

  return { sent, removed, failed };
}
