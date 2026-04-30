/**
 * Helpers de fecha/hora compatibles con Safari (incluyendo iOS).
 *
 * Safari es estricto con `new Date(string)`: si el string viene con seconds
 * inesperados o con AM/PM, lo regresa como Invalid Date. iOS Safari ademas
 * a veces popula <input type="time"> con formato distinto. Estos helpers
 * normalizan TODO lo que pueda venir del DOM.
 */

/** YMD en TZ local del navegador (no UTC). Usa esto en vez de
 *  toISOString().slice(0,10) para evitar el shift de TZ. */
export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** HH:MM en hora local del navegador. */
export function localHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Acepta "HH:MM", "HH:MM:SS", "H:MM AM/PM", "HH:MM AM/PM",
 *  "h:MM a.m./p.m." (formato iOS). Devuelve [horas, minutos] en 24h. */
export function parseHora(raw: string): [number, number] | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|a\.?\s*m\.?|p\.?\s*m\.?)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return null;
  const ampmRaw = m[3]?.toLowerCase().replace(/[\s.]/g, "") ?? "";
  if (ampmRaw === "pm") {
    if (h < 12) h += 12;
  } else if (ampmRaw === "am") {
    if (h === 12) h = 0;
  }
  if (h > 23) return null;
  return [h, min];
}

/** Construye un Date local del navegador a partir de YYYY-MM-DD + HH:MM
 *  defensivo. NO depende de new Date(string) que Safari interpreta distinto. */
export function buildLocalDate(fecha: string, hora: string): Date | null {
  const fm = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!fm) return null;
  const hm = parseHora(hora);
  if (!hm) return null;
  return new Date(
    parseInt(fm[1], 10),
    parseInt(fm[2], 10) - 1,
    parseInt(fm[3], 10),
    hm[0],
    hm[1],
    0,
    0,
  );
}
