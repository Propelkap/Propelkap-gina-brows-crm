/**
 * GET /api/consentimientos/[id]/pdf
 * Genera una URL firmada (60 min) del PDF en el bucket privado y redirige.
 * Requiere sesión autenticada.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: cons, error } = await sb
    .from("consentimientos")
    .select("pdf_path, firmado_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !cons) {
    return NextResponse.json({ error: "Consentimiento no encontrado" }, { status: 404 });
  }
  if (!cons.pdf_path) {
    return NextResponse.json({ error: "Sin PDF generado todavía" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await sb.storage
    .from("consentimientos-firmados")
    .createSignedUrl(cons.pdf_path, 60 * 60); // 1h

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message || "No pude firmar URL" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
