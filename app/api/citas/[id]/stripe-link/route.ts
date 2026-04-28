/**
 * Genera un Stripe Payment Link para el anticipo de una cita.
 * El link queda guardado en `pagos.stripe_payment_link_url` y se puede mandar por WhatsApp.
 * Cuando la clienta paga, el webhook /api/webhooks/stripe marca la cita como confirmada
 * + crea evento en Google Calendar de Gina.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: citaId } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({
      error: "Stripe aún no está conectado",
      hint: "Falta STRIPE_SECRET_KEY en envs. Cuando Gina firme su cuenta Stripe, agregar la key y este endpoint funcionará automáticamente.",
    }, { status: 503 });
  }

  // Cargar cita + cliente + servicio
  const { data: cita, error } = await sb
    .from("citas")
    .select("*, cliente:clientes(nombre, apellido, email, whatsapp), servicio:servicios(nombre)")
    .eq("id", citaId)
    .single();
  if (error || !cita) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const porcentajeAnticipo = body.porcentaje_anticipo ?? 50;
  const monto = Math.round(Number(cita.precio_mxn) * (porcentajeAnticipo / 100) * 100); // centavos

  const stripe = new Stripe(stripeKey);

  // Crear price one-shot + payment link con metadata cita_id
  const product = await stripe.products.create({
    name: `${cita.servicio?.nombre} — Anticipo (${porcentajeAnticipo}%)`,
    description: `Cita ${new Date(cita.inicio).toLocaleString("es-MX")} para ${cita.cliente?.nombre} ${cita.cliente?.apellido ?? ""}`,
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: monto,
    currency: "mxn",
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { cita_id: citaId },
    after_completion: {
      type: "hosted_confirmation",
      hosted_confirmation: { custom_message: "¡Listo! Tu cita queda apartada. Te llega confirmación por WhatsApp 🌿" },
    },
  });

  // Guardar en pagos
  await sb.from("pagos").insert({
    cliente_id: cita.cliente_id,
    cita_id: citaId,
    monto_mxn: monto / 100,
    metodo: "stripe",
    estado: "pendiente",
    stripe_payment_link_url: link.url,
    stripe_metadata: { product_id: product.id, price_id: price.id, link_id: link.id },
  });

  return NextResponse.json({ ok: true, url: link.url, monto: monto / 100 });
}
