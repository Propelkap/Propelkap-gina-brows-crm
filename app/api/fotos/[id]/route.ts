/**
 * DELETE /api/fotos/[id]
 * Borra la foto del bucket clientes-fotos y el row en la tabla.
 * Requiere sesión autenticada.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // 1. Buscar la foto para obtener storage_path
  const { data: foto, error: errFoto } = await sb
    .from("fotos")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (errFoto || !foto) {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  // 2. Borrar del bucket (no fatal si falla — el archivo puede no existir,
  //    igual queremos limpiar el row de la DB)
  if (foto.storage_path) {
    const { error: rmErr } = await sb.storage
      .from("clientes-fotos")
      .remove([foto.storage_path]);
    if (rmErr) {
      console.warn(`No pude borrar ${foto.storage_path} del bucket:`, rmErr.message);
    }
  }

  // 3. Borrar row de la DB
  const { error: delErr } = await sb.from("fotos").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
