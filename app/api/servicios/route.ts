/**
 * POST /api/servicios — crear servicio nuevo
 * GET  /api/servicios — listar (visibles + invisibles)
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  nombre: string;
  precio_mxn: number;
  duracion_min: number;
  categoria?: string | null;
  descripcion?: string | null;
  retoque_dias_obligatorio?: number | null;
  retoque_precio_mxn?: number | null;
  retoque_anual_dias?: number | null;
  retoque_anual_precio_mxn?: number | null;
  visible?: boolean;
  orden?: number;
};

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data, error } = await sb
    .from("servicios")
    .select("*")
    .order("orden", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ servicios: data ?? [] });
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.nombre?.trim()) return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
  if (!body.precio_mxn || body.precio_mxn < 0) return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
  if (!body.duracion_min || body.duracion_min < 5) return NextResponse.json({ error: "Duración inválida" }, { status: 400 });

  const { data, error } = await sb
    .from("servicios")
    .insert({
      nombre: body.nombre.trim(),
      precio_mxn: body.precio_mxn,
      duracion_min: body.duracion_min,
      categoria: body.categoria?.trim() || null,
      descripcion: body.descripcion?.trim() || null,
      retoque_dias_obligatorio: body.retoque_dias_obligatorio || null,
      retoque_precio_mxn: body.retoque_precio_mxn || null,
      retoque_anual_dias: body.retoque_anual_dias || null,
      retoque_anual_precio_mxn: body.retoque_anual_precio_mxn || null,
      visible: body.visible ?? true,
      orden: body.orden ?? 0,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, servicio: data });
}
