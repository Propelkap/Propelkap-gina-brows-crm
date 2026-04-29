/**
 * Items / productos extras consumidos en la cita (check-out).
 * GET: lista los items de una cita
 * POST: agrega un item (servicio del catálogo o descripción libre)
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data, error } = await sb
    .from("cita_items")
    .select("*, servicio:servicios(nombre, categoria)")
    .eq("cita_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cita_id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { servicio_id, descripcion_libre, cantidad, precio_unitario_mxn, notas } = body as {
    servicio_id?: string | null;
    descripcion_libre?: string | null;
    cantidad?: number;
    precio_unitario_mxn?: number;
    notas?: string | null;
  };

  if (!servicio_id && (!descripcion_libre || !descripcion_libre.trim())) {
    return NextResponse.json({ error: "Falta servicio_id o descripcion_libre" }, { status: 400 });
  }
  if (precio_unitario_mxn == null || precio_unitario_mxn < 0) {
    return NextResponse.json({ error: "Falta precio_unitario_mxn" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("cita_items")
    .insert({
      cita_id,
      servicio_id: servicio_id || null,
      descripcion_libre: descripcion_libre?.trim() || null,
      cantidad: cantidad ?? 1,
      precio_unitario_mxn,
      notas: notas || null,
      created_by: user.id,
    })
    .select("*, servicio:servicios(nombre, categoria)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
