import { createClient } from "@/lib/supabase/server";
import AgendaCalendar from "./AgendaCalendar";

export const dynamic = "force-dynamic";

type SearchParams = { semana?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { semana } = await searchParams;

  // Determinar lunes de la semana a mostrar
  const base = semana ? new Date(semana) : new Date();
  const monday = startOfWeek(base);
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);

  const sb = await createClient();
  const { data: citas } = await sb
    .from("citas")
    .select("id, inicio, fin, estado, precio_mxn, sesion_numero, sesiones_totales, google_event_id, calendar_synced_at, notas_internas, cliente:clientes(id, nombre, apellido, whatsapp), servicio:servicios(id, nombre, precio_mxn, duracion_min)")
    .gte("inicio", monday.toISOString())
    .lt("inicio", nextMonday.toISOString())
    .neq("estado", "cancelada")
    .order("inicio", { ascending: true });

  // Supabase typing: inline relations come as arrays even when 1-to-1
  const normalized = (citas ?? []).map((c: any) => ({
    ...c,
    cliente: Array.isArray(c.cliente) ? c.cliente[0] ?? null : c.cliente,
    servicio: Array.isArray(c.servicio) ? c.servicio[0] ?? null : c.servicio,
  }));

  return <AgendaCalendar citas={normalized} mondayISO={monday.toISOString()} />;
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day; // domingo → -6 para ir al lunes anterior
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}
