/**
 * Genera un link único firmable para que la clienta llene el consentimiento desde iPad.
 * El admin lo dispara desde la ficha de cita o desde el detalle del cliente.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { cliente_id, cita_id, template_tipo } = await req.json() as {
    cliente_id: string;
    cita_id?: string | null;
    template_tipo?: string; // ej: 'microblading_v1' o 'remocion_laser_v1'
  };

  if (!cliente_id) {
    return NextResponse.json({ error: "Falta cliente_id" }, { status: 400 });
  }

  // 1. Resolver template: si vino especifico, usarlo. Si no, deducir del servicio de la cita.
  let templateId: string | null = null;
  let templateNombre = "Consentimiento";

  if (template_tipo) {
    const { data: t } = await sb.from("consentimiento_templates")
      .select("id, nombre, tipo")
      .eq("tipo", template_tipo)
      .eq("activo", true)
      .single();
    if (t) { templateId = t.id; templateNombre = t.nombre; }
  } else if (cita_id) {
    // Buscar el servicio de la cita y matchear con servicios_aplica del template
    const { data: cita } = await sb.from("citas").select("servicio_id").eq("id", cita_id).single();
    if (cita) {
      const { data: tpls } = await sb.from("consentimiento_templates")
        .select("id, nombre, tipo, servicios_aplica")
        .eq("activo", true);
      const match = (tpls ?? []).find((t: { servicios_aplica: string[] | null }) =>
        Array.isArray(t.servicios_aplica) && t.servicios_aplica.includes(cita.servicio_id)
      );
      if (match) { templateId = match.id; templateNombre = match.nombre; }
    }
  }

  if (!templateId) {
    return NextResponse.json({
      error: "No se encontró template aplicable. Indica template_tipo o asocia el servicio en consentimiento_templates.servicios_aplica.",
    }, { status: 400 });
  }

  // 2. Generar token único de un solo uso, válido por 7 días
  const token = randomBytes(24).toString("base64url");
  const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // 3. Crear el registro de consentimiento pendiente (firmado_at = null)
  const { data: consentimiento, error } = await sb.from("consentimientos").insert({
    cliente_id,
    cita_id: cita_id || null,
    tipo: templateNombre,
    template_id: templateId,
    contenido_html: "", // se rellena al firmar
    firmado_at: null as unknown as string, // null hasta que firme
    token,
    token_expira_at: expira.toISOString(),
  }).select("id").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://gina-brows-crm.vercel.app";
  const url = `${baseUrl}/consentimiento/${token}`;

  return NextResponse.json({
    ok: true,
    consentimiento_id: consentimiento.id,
    url,
    token,
    expira: expira.toISOString(),
  });
}
