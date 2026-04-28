import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const clienteId = form.get("cliente_id") as string;
  const tipo = (form.get("tipo") as string) || "general";
  const procedimientoId = (form.get("procedimiento_id") as string) || null;
  const descripcion = (form.get("descripcion") as string) || null;

  if (!file || !clienteId) {
    return NextResponse.json({ error: "Falta archivo o cliente" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${clienteId}/${Date.now()}-${tipo}.${ext}`;

  const { error: upErr } = await sb.storage
    .from("clientes-fotos")
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await sb
    .from("fotos")
    .insert({
      cliente_id: clienteId,
      procedimiento_id: procedimientoId,
      storage_path: path,
      tipo,
      descripcion,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, path });
}
