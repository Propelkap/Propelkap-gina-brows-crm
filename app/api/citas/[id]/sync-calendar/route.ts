/**
 * Sincroniza una cita a Google Calendar manualmente (sin esperar Stripe).
 * Útil mientras Stripe no está activo, para validar el flujo end-to-end.
 *
 * POST → crea evento en el calendario del usuario actual.
 * DELETE → elimina el evento del calendar y limpia google_event_id.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { crearEventoCalendar } from "@/lib/calendar";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: citaId } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Verificar que el usuario tenga token de Google Calendar
  const { data: token } = await sb
    .from("calendar_tokens")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("proveedor", "google")
    .maybeSingle();

  if (!token) {
    return NextResponse.json({
      error: "Google Calendar no está conectado",
      hint: "Ve a /configuracion → Integraciones → Conectar Google Calendar",
    }, { status: 400 });
  }

  // Cargar la cita con cliente y servicio
  const { data: cita, error } = await sb
    .from("citas")
    .select("*, cliente:clientes(nombre, apellido, email), servicio:servicios(nombre)")
    .eq("id", citaId)
    .single();
  if (error || !cita) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  if (cita.estado === "cancelada") {
    return NextResponse.json({ error: "No se sincronizan citas canceladas" }, { status: 400 });
  }

  const cliente = Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente;
  const servicio = Array.isArray(cita.servicio) ? cita.servicio[0] : cita.servicio;

  const eventId = await crearEventoCalendar(sb, user.id, {
    titulo: `${servicio?.nombre ?? "Cita"} — ${cliente?.nombre ?? ""} ${cliente?.apellido ?? ""}`,
    descripcion: `Cita en Gina Brows · $${Number(cita.precio_mxn).toFixed(0)} MXN${cita.notas_internas ? `\n\nNotas: ${cita.notas_internas}` : ""}`,
    inicio: cita.inicio,
    fin: cita.fin,
    invitadoEmail: cliente?.email ?? undefined,
  });

  if (!eventId) {
    return NextResponse.json({ error: "Google rechazó la creación del evento" }, { status: 500 });
  }

  await sb.from("citas").update({
    google_event_id: eventId,
    calendar_synced_at: new Date().toISOString(),
  }).eq("id", citaId);

  return NextResponse.json({ ok: true, event_id: eventId });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: citaId } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Por simplicidad solo limpiamos el campo en BD (no borramos el evento de Google).
  // Si después quieres borrarlo de Google, hay que llamar al API DELETE de events.
  await sb.from("citas").update({
    google_event_id: null,
    calendar_synced_at: null,
  }).eq("id", citaId);

  return NextResponse.json({ ok: true });
}
