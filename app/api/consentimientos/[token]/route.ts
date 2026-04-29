/**
 * GET público — devuelve el template + datos pre-llenados para que la clienta firme desde iPad.
 * No requiere autenticación.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = createServiceClient();

  // 1. Cargar consentimiento por token
  const { data: cons, error } = await sb
    .from("consentimientos")
    .select("id, cliente_id, cita_id, template_id, firmado_at, token_expira_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !cons) {
    return NextResponse.json({ error: "Link inválido o ya fue usado" }, { status: 404 });
  }

  if (cons.firmado_at) {
    return NextResponse.json({ error: "Este consentimiento ya fue firmado", firmado: true }, { status: 410 });
  }

  if (cons.token_expira_at && new Date(cons.token_expira_at) < new Date()) {
    return NextResponse.json({ error: "Link expirado" }, { status: 410 });
  }

  // 2. Cargar template + cliente + cita en paralelo
  const [templateRes, clienteRes, citaRes] = await Promise.all([
    sb.from("consentimiento_templates").select("nombre, tipo, estructura").eq("id", cons.template_id!).single(),
    sb.from("clientes").select("nombre, apellido, email, whatsapp, fecha_nacimiento").eq("id", cons.cliente_id).single(),
    cons.cita_id
      ? sb.from("citas").select("inicio, servicio:servicios(nombre)").eq("id", cons.cita_id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!templateRes.data) {
    return NextResponse.json({ error: "Template no encontrado" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    template: templateRes.data,
    cliente: clienteRes.data,
    cita: citaRes.data,
    consentimiento_id: cons.id,
  });
}
