import { createClient } from "@/lib/supabase/server";
import WhatsAppInbox from "./WhatsAppInbox";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sb = await createClient();

  // Cargar las últimas conversaciones (1 por clienta con su último mensaje)
  const { data: ultimasComs } = await sb
    .from("comunicaciones")
    .select("id, cliente_id, canal, direccion, cuerpo, enviado_at, leido_at, respondido_at")
    .eq("canal", "whatsapp")
    .order("enviado_at", { ascending: false })
    .limit(500);

  // Agrupar por cliente_id (más reciente primero)
  type Comm = NonNullable<typeof ultimasComs>[number];
  const conversaciones = new Map<string, Comm>();
  for (const c of ultimasComs ?? []) {
    if (c.cliente_id && !conversaciones.has(c.cliente_id)) {
      conversaciones.set(c.cliente_id, c);
    }
  }

  // Cargar info de los clientes
  const clienteIds = [...conversaciones.keys()];
  const { data: clientes } = clienteIds.length
    ? await sb.from("clientes").select("id, nombre, apellido, whatsapp, bot_pausado").in("id", clienteIds)
    : { data: [] };

  const conversacionesArr = (clientes ?? []).map((cl) => ({
    cliente: cl,
    ultimo: conversaciones.get(cl.id)!,
  })).sort((a, b) => (b.ultimo.enviado_at > a.ultimo.enviado_at ? 1 : -1));

  return <WhatsAppInbox conversaciones={conversacionesArr} />;
}
