import { createClient } from "@/lib/supabase/server";
import AgendaCalendar from "./AgendaCalendar";

export const dynamic = "force-dynamic";

const TZ = "America/Monterrey"; // UTC-6 (Mexico aboli DST en 2022)

type SearchParams = { semana?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { semana } = await searchParams;

  // 1. Determinar el lunes de la semana a mostrar — todo el calculo en YMD
  //    string (TZ-independent) para evitar drift entre servidor UTC y cliente MX.
  const todayYmdMX = ymdInTZ(new Date(), TZ);
  const baseYmd = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : todayYmdMX;
  const mondayYmd = mondayYmdFromYmd(baseYmd);
  const nextMondayYmd = addDaysYmd(mondayYmd, 7);

  // 2. Para filtrar citas, convertir las fronteras YMD a instantes en MX TZ.
  const mondayInstant = new Date(`${mondayYmd}T00:00:00-06:00`);
  const nextMondayInstant = new Date(`${nextMondayYmd}T00:00:00-06:00`);

  const sb = await createClient();
  const { data: citas } = await sb
    .from("citas")
    .select("id, inicio, fin, estado, precio_mxn, sesion_numero, sesiones_totales, google_event_id, calendar_synced_at, notas_internas, cliente:clientes(id, nombre, apellido, whatsapp), servicio:servicios(id, nombre, precio_mxn, duracion_min)")
    .gte("inicio", mondayInstant.toISOString())
    .lt("inicio", nextMondayInstant.toISOString())
    .neq("estado", "cancelada")
    .order("inicio", { ascending: true });

  // Supabase typing: inline relations come as arrays even when 1-to-1
  const normalized = (citas ?? []).map((c: any) => ({
    ...c,
    cliente: Array.isArray(c.cliente) ? c.cliente[0] ?? null : c.cliente,
    servicio: Array.isArray(c.servicio) ? c.servicio[0] ?? null : c.servicio,
  }));

  return (
    <AgendaCalendar
      citas={normalized}
      mondayYmd={mondayYmd}
      todayYmd={todayYmdMX}
    />
  );
}

// ---------- helpers TZ-safe ----------

/** Devuelve "YYYY-MM-DD" para un Date en la TZ dada (default MX). */
function ymdInTZ(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Dada una fecha YMD, devuelve el lunes de su semana (lun=primer dia). */
function mondayYmdFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Math en UTC para que getUTCDay sea independiente del TZ del runtime.
  const utcMid = new Date(Date.UTC(y, m - 1, d));
  const dow = utcMid.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  utcMid.setUTCDate(utcMid.getUTCDate() + diff);
  return formatUtcYmd(utcMid);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utcMid = new Date(Date.UTC(y, m - 1, d + days));
  return formatUtcYmd(utcMid);
}

function formatUtcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
