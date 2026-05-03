import { adminSb, hasSupabase } from "./supabase-admin";

export type Conversation = {
  jid: string;
  phone: string; // E.164 sin +
  last_content: string | null;
  last_message_type: string;
  last_ts: string;
  last_direction: "in" | "out";
  message_count: number;
};

export type WAMessage = {
  id: number;
  message_id: string | null;
  direction: "in" | "out";
  content: string | null;
  message_type: string;
  from_jid: string | null;
  to_jid: string | null;
  ts: string;
};

/**
 * Devuelve la lista de conversaciones agrupadas por contraparte (jid).
 * Lee hasta 500 mensajes recientes y los agrupa en JS — para sandbox alcanza.
 * Cuando portemos al template haremos una vista materializada o agrupación SQL.
 */
export async function getConversations(instanceName: string): Promise<Conversation[]> {
  if (!hasSupabase()) return [];
  const sb = adminSb();

  const { data, error } = await sb
    .from("whatsapp_messages")
    .select("from_jid, to_jid, direction, content, message_type, ts")
    .eq("instance_name", instanceName)
    .order("ts", { ascending: false })
    .limit(500);

  if (error || !data) return [];

  const map = new Map<string, Conversation>();
  for (const m of data) {
    const counterparty = m.direction === "in" ? m.from_jid : m.to_jid;
    if (!counterparty) continue;
    if (counterparty.endsWith("@g.us")) continue; // ignorar grupos por ahora

    if (!map.has(counterparty)) {
      map.set(counterparty, {
        jid: counterparty,
        phone: counterparty.split("@")[0] ?? "",
        last_content: m.content,
        last_message_type: m.message_type,
        last_ts: m.ts,
        last_direction: m.direction,
        message_count: 1,
      });
    } else {
      const c = map.get(counterparty)!;
      c.message_count++;
    }
  }

  return Array.from(map.values()).sort((a, b) => (a.last_ts < b.last_ts ? 1 : -1));
}

/**
 * Devuelve los mensajes de una conversación específica, en orden cronológico.
 */
export async function getConversationMessages(
  instanceName: string,
  jid: string
): Promise<WAMessage[]> {
  if (!hasSupabase()) return [];
  const sb = adminSb();

  const { data, error } = await sb
    .from("whatsapp_messages")
    .select("id, message_id, direction, content, message_type, from_jid, to_jid, ts")
    .eq("instance_name", instanceName)
    .or(`from_jid.eq.${jid},to_jid.eq.${jid}`)
    .order("ts", { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data as WAMessage[];
}

/**
 * Formato MX: 5212462999221 → +52 (124) 629-9221
 * Formato genérico: deja como vino con +.
 */
export function formatPhone(raw: string): string {
  const clean = raw.replace(/[^\d]/g, "");
  if (clean.startsWith("521") && clean.length === 13) {
    // MX cell: 52 + 1 + 10 dígitos
    const ten = clean.slice(3);
    return `+52 ${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
  }
  if (clean.startsWith("52") && clean.length === 12) {
    const ten = clean.slice(2);
    return `+52 ${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
  }
  return `+${clean}`;
}

/**
 * "hace 5 min", "ayer", "12 abr", etc.
 */
export function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000; // s

  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 2) return "ayer";
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
