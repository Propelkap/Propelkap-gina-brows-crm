/**
 * GET  /api/citas/[id]/pagos  → lista pagos + resumen de saldo
 * POST /api/citas/[id]/pagos  → registra un pago
 *
 * Replica el checkout estilo AgendaPro: cita puede tener N pagos parciales
 * con distintos metodos. La vista v_citas_saldo calcula total/pagado/saldo.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const METODOS_VALIDOS = [
  "efectivo",
  "terminal",
  "tarjeta_credito",
  "tarjeta_debito",
  "transferencia",
  "giftcard",
  "link_pago",
  "stripe",
  "otro",
] as const;
type Metodo = (typeof METODOS_VALIDOS)[number];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [pagosRes, saldoRes] = await Promise.all([
    sb.from("pagos")
      .select("id, monto_mxn, metodo, estado, referencia, notas, pagado_at, created_at, created_by")
      .eq("cita_id", id)
      .order("created_at", { ascending: true }),
    sb.from("v_citas_saldo")
      .select("precio_servicio_mxn, total_items_mxn, anticipo_mxn, total_mxn, total_pagado_mxn, saldo_mxn, num_pagos, estado_pago")
      .eq("cita_id", id)
      .maybeSingle(),
  ]);

  if (pagosRes.error) return NextResponse.json({ error: pagosRes.error.message }, { status: 500 });

  return NextResponse.json({
    pagos: pagosRes.data ?? [],
    saldo: saldoRes.data ?? null,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json() as {
    monto_mxn: number;
    metodo: Metodo;
    referencia?: string | null;
    notas?: string | null;
  };

  if (!body.monto_mxn || body.monto_mxn <= 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }
  if (!METODOS_VALIDOS.includes(body.metodo)) {
    return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
  }

  // Buscar cliente_id para el row de pagos
  const { data: cita, error: errCita } = await sb
    .from("citas")
    .select("cliente_id")
    .eq("id", id)
    .maybeSingle();
  if (errCita || !cita) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const { data: pago, error } = await sb
    .from("pagos")
    .insert({
      cita_id: id,
      cliente_id: cita.cliente_id,
      monto_mxn: body.monto_mxn,
      metodo: body.metodo,
      estado: "pagado",
      pagado_at: new Date().toISOString(),
      referencia: body.referencia?.trim() || null,
      notas: body.notas?.trim() || null,
      created_by: user.id,
    })
    .select("id, monto_mxn, metodo, estado, referencia, notas, pagado_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pago });
}
