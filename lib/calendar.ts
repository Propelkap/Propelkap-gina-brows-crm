/**
 * Helpers para crear eventos en Google Calendar.
 * Lo usa el webhook de Stripe cuando confirma un anticipo de valoración.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

async function refreshTokenIfNeeded(sb: SupabaseClient, usuarioId: string) {
  const { data: tk } = await sb
    .from("calendar_tokens")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("proveedor", "google")
    .single();

  if (!tk) return null;

  // Si expira en < 5 min, refrescar
  const expiresIn = new Date(tk.expires_at).getTime() - Date.now();
  if (expiresIn > 5 * 60_000) return tk.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: tk.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const fresh = await res.json();

  await sb.from("calendar_tokens").update({
    access_token: fresh.access_token,
    expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
  }).eq("usuario_id", usuarioId).eq("proveedor", "google");

  return fresh.access_token as string;
}

export async function crearEventoCalendar(
  sb: SupabaseClient,
  usuarioId: string,
  evento: {
    titulo: string;
    descripcion?: string;
    inicio: string; // ISO
    fin: string;
    invitadoEmail?: string;
  }
): Promise<string | null> {
  const accessToken = await refreshTokenIfNeeded(sb, usuarioId);
  if (!accessToken) return null;

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: evento.titulo,
      description: evento.descripcion,
      start: { dateTime: evento.inicio, timeZone: "America/Monterrey" },
      end: { dateTime: evento.fin, timeZone: "America/Monterrey" },
      attendees: evento.invitadoEmail ? [{ email: evento.invitadoEmail }] : [],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id ?? null;
}
