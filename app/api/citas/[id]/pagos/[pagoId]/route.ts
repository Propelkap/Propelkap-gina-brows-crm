/**
 * DELETE /api/citas/[id]/pagos/[pagoId]
 * Elimina un pago registrado (corregir error de captura).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; pagoId: string }> }
) {
  const { id, pagoId } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { error } = await sb
    .from("pagos")
    .delete()
    .eq("id", pagoId)
    .eq("cita_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
