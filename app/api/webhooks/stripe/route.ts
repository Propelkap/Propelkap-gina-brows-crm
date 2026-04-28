/**
 * Webhook Stripe: cuando se confirma un anticipo de cita, marca cita como confirmada
 * y la sincroniza con Google Calendar de Gina.
 *
 * Configurar en Stripe dashboard:
 *   Endpoint URL: https://crm.ginabrows.com/api/webhooks/stripe
 *   Eventos: checkout.session.completed, payment_intent.succeeded
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { crearEventoCalendar } from "@/lib/calendar";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!sig || !secret || !stripeKey) {
    return NextResponse.json({ error: "Stripe no configurado" }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  const sb = createServiceClient();

  if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session;
    const citaId = (intent.metadata as Record<string, string> | null)?.cita_id;
    const monto = ("amount_received" in intent ? intent.amount_received : intent.amount_total) ?? 0;

    if (!citaId) {
      return NextResponse.json({ ok: true, info: "sin cita_id en metadata" });
    }

    // 1. Marcar cita como confirmada + registrar pago
    await sb.from("citas").update({
      estado: "confirmada",
      anticipo_mxn: monto / 100,
      confirmada_por_cliente_at: new Date().toISOString(),
    }).eq("id", citaId);

    await sb.from("pagos").insert({
      cita_id: citaId,
      monto_mxn: monto / 100,
      metodo: "stripe",
      estado: "pagado",
      stripe_payment_intent_id: intent.id,
      pagado_at: new Date().toISOString(),
    });

    // 2. Crear evento en Google Calendar de Gina (si tiene token)
    const { data: cita } = await sb.from("citas").select("*, cliente:clientes(nombre, apellido, email), servicio:servicios(nombre)").eq("id", citaId).single();
    if (cita) {
      const { data: admin } = await sb.from("usuarios").select("id").eq("rol", "admin").eq("activo", true).limit(1).single();
      if (admin) {
        const eventId = await crearEventoCalendar(sb, admin.id, {
          titulo: `${cita.servicio?.nombre} — ${cita.cliente?.nombre} ${cita.cliente?.apellido ?? ""}`,
          descripcion: `Cita confirmada vía Stripe. Anticipo cobrado: $${(monto / 100).toFixed(2)} MXN`,
          inicio: cita.inicio,
          fin: cita.fin,
          invitadoEmail: cita.cliente?.email,
        });
        if (eventId) {
          await sb.from("citas").update({ google_event_id: eventId, calendar_synced_at: new Date().toISOString() }).eq("id", citaId);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
