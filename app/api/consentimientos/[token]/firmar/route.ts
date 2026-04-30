/**
 * POST público — recibe respuestas + firma, genera PDF y lo sube al bucket privado.
 * Marca el consentimiento como firmado y limpia el token (un solo uso).
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generarPdfConsentimiento } from "@/lib/pdf-consentimiento";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createServiceClient();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");

  const body = await req.json() as {
    respuestas: Record<string, string | boolean>;
    iniciales: Record<string, string>;
    firma_data_url: string;
  };

  if (!body.respuestas || !body.firma_data_url) {
    return NextResponse.json({ error: "Faltan respuestas o firma" }, { status: 400 });
  }

  // 1. Validar token
  const { data: cons, error: errCons } = await sb
    .from("consentimientos")
    .select("id, cliente_id, cita_id, template_id, firmado_at, token_expira_at")
    .eq("token", token)
    .maybeSingle();

  if (errCons || !cons) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }
  if (cons.firmado_at) {
    return NextResponse.json({ error: "Ya fue firmado anteriormente" }, { status: 410 });
  }
  if (cons.token_expira_at && new Date(cons.token_expira_at) < new Date()) {
    return NextResponse.json({ error: "Link expirado" }, { status: 410 });
  }

  // 2. Cargar template para generar PDF
  const { data: template } = await sb
    .from("consentimiento_templates")
    .select("nombre, tipo, estructura")
    .eq("id", cons.template_id!)
    .single();

  if (!template) {
    return NextResponse.json({ error: "Template no encontrado" }, { status: 500 });
  }

  // 3. Generar PDF
  const fechaFirma = new Date();
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generarPdfConsentimiento({
      estructura: template.estructura,
      respuestas: body.respuestas,
      iniciales: body.iniciales,
      firmaDataUrl: body.firma_data_url,
      fechaFirma,
      ip: ip ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("PDF generation error:", msg, e);
    return NextResponse.json(
      { error: "No pude generar el PDF", detail: msg },
      { status: 500 }
    );
  }

  // 4. Subir PDF al bucket
  const path = `${cons.cliente_id}/${cons.id}-${fechaFirma.getTime()}.pdf`;
  const { error: upErr } = await sb.storage
    .from("consentimientos-firmados")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });

  if (upErr) {
    console.error("Upload error:", upErr);
    return NextResponse.json({ error: "No pude guardar el PDF" }, { status: 500 });
  }

  // 5. Actualizar registro: firmado_at + respuestas + path + invalidar token
  const { error: updErr } = await sb.from("consentimientos").update({
    firmado_at: fechaFirma.toISOString(),
    respuestas: { ...body.respuestas, iniciales: body.iniciales },
    contenido_html: null,
    pdf_path: path,
    firma_ip: ip,
    firma_user_agent: userAgent,
    ip_firma: ip,
    token: null,            // invalida token (un solo uso)
    token_expira_at: null,
  }).eq("id", cons.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, consentimiento_id: cons.id });
}
