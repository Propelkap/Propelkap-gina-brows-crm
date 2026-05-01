/**
 * PATCH  /api/servicios/[id] — actualiza campos arbitrarios del servicio
 * DELETE /api/servicios/[id] — soft delete (visible=false). Hard delete
 *   romperia citas historicas que apuntan al servicio_id.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_FIELDS = [
  "nombre",
  "descripcion",
  "categoria",
  "precio_mxn",
  "duracion_min",
  "retoque_dias_obligatorio",
  "retoque_precio_mxn",
  "retoque_anual_dias",
  "retoque_anual_precio_mxn",
  "visible",
  "orden",
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // Whitelist de campos
  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in body) {
      const v = body[k];
      // Strings vacios → null (excepto nombre que no permite null)
      if (typeof v === "string" && !v.trim() && k !== "nombre") {
        updates[k] = null;
      } else {
        updates[k] = v;
      }
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from("servicios")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, servicio: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Soft delete: visible=false. Las citas historicas siguen viendo el nombre.
  const { error } = await sb
    .from("servicios")
    .update({ visible: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
