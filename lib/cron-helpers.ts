/**
 * Helpers compartidos por los endpoints de cron.
 *
 * - assertCronAuth: valida el header `Authorization: Bearer <CRON_SECRET>`
 *   que Vercel Crons manda automáticamente. Tambien permite ejecucion
 *   manual desde curl con el mismo secret.
 * - mxRange: helpers para construir rangos de tiempo en TZ Monterrey
 *   (UTC-6 fijo desde 2022).
 * - yaSeMandoTemplate: defensa contra duplicados — checa si en la tabla
 *   `comunicaciones` ya hay un envio de la misma template para la cita
 *   o cliente especificos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TZ = "America/Monterrey"; // UTC-6, sin DST desde 2022
export const TZ_OFFSET = "-06:00";

/** Rechaza requests sin secret valido. */
export function assertCronAuth(req: Request): Response | null {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "CRON_SECRET no configurado" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

/** YYYY-MM-DD del momento actual en TZ MX. */
export function todayYmdMX(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Suma N dias (positivo o negativo) a un YMD y devuelve el resultado. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Intervalo en TZ MX: [start, end) como instantes ISO UTC. */
export function mxDayRange(ymd: string): { start: string; end: string } {
  const start = new Date(`${ymd}T00:00:00${TZ_OFFSET}`).toISOString();
  const end = new Date(`${addDaysYmd(ymd, 1)}T00:00:00${TZ_OFFSET}`).toISOString();
  return { start, end };
}

/** Mes/dia (MM-DD) actual en TZ MX, util para cumples. */
export function todayMonthDayMX(): string {
  const ymd = todayYmdMX();
  return ymd.slice(5); // "MM-DD"
}

/** Defensa anti-duplicado: ¿ya se mando esta template a este cliente/cita? */
export async function yaSeMandoTemplate(
  sb: SupabaseClient,
  templateName: string,
  opts: { citaId?: string; clienteId?: string; desdeISO?: string }
): Promise<boolean> {
  let q = sb
    .from("comunicaciones")
    .select("id", { count: "exact", head: true })
    .eq("template_usado", templateName)
    .eq("direccion", "saliente");
  if (opts.citaId) q = q.eq("cita_id", opts.citaId);
  if (opts.clienteId) q = q.eq("cliente_id", opts.clienteId);
  if (opts.desdeISO) q = q.gte("created_at", opts.desdeISO);
  const { count } = await q;
  return (count ?? 0) > 0;
}

/** Format helpers para variables de templates. */
export function fmtHoraMX(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function fmtFechaLargaMX(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

/** Limpia whatsapp a E.164: '+528131175672'. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = raw.replace(/[^0-9+]/g, "");
  if (!clean) return null;
  return clean.startsWith("+") ? clean : `+${clean}`;
}
