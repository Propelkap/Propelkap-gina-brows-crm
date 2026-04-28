import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Destinatario = { id: string; nombre: string; whatsapp: string | null };

function aplicarVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    nombre,           // nombre de la campaña
    tipo,             // campania_tipo enum
    template_id,      // si viene, agarrar de email_templates; si no, usar `contenido` raw
    contenido,        // mensaje raw con {{nombre}} etc
    canal,            // 'whatsapp' | 'email'
    destinatarios,    // [{id, nombre, whatsapp}]
  } = body as {
    nombre: string;
    tipo: string;
    template_id?: string;
    contenido?: string;
    canal: "whatsapp" | "email";
    destinatarios: Destinatario[];
  };

  if (!destinatarios?.length) return NextResponse.json({ error: "Sin destinatarios" }, { status: 400 });

  // Si vino template_id, leerlo
  let cuerpo = contenido ?? "";
  let templateName: string | null = null;
  if (template_id) {
    const { data: t } = await sb.from("email_templates").select("cuerpo_texto, nombre").eq("id", template_id).single();
    if (t) { cuerpo = t.cuerpo_texto; templateName = t.nombre; }
  }
  if (!cuerpo.trim()) return NextResponse.json({ error: "Sin contenido" }, { status: 400 });

  // 1. Crear la campaña
  const { data: camp, error: campErr } = await sb.from("campanias").insert({
    nombre,
    tipo: tipo || "broadcast_libre",
    estado: "enviando",
    template_meta: templateName,
    contenido: cuerpo,
    total_destinatarios: destinatarios.length,
    iniciada_at: new Date().toISOString(),
    created_by: user.id,
  }).select("id").single();

  if (campErr || !camp) return NextResponse.json({ error: campErr?.message || "Error creando campaña" }, { status: 500 });

  // 2. Crear 1 fila en `comunicaciones` por destinataria con el cuerpo personalizado
  const filas = destinatarios.filter((d) => d.whatsapp || canal === "email").map((d) => {
    const personalizado = aplicarVariables(cuerpo, {
      nombre: (d.nombre || "").split(" ")[0] || "",
      apellido: (d.nombre || "").split(" ").slice(1).join(" ") || "",
    });
    return {
      cliente_id: d.id,
      canal,
      direccion: "saliente" as const,
      cuerpo: personalizado,
      template_usado: templateName || nombre,
      campania_id: camp.id,
      estado_entrega: "simulado", // cuando Twilio esté activo, será 'sent'/'delivered'/etc
      enviado_at: new Date().toISOString(),
    };
  });

  // Insertar en chunks
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < filas.length; i += CHUNK) {
    const { data, error } = await sb.from("comunicaciones").insert(filas.slice(i, i + CHUNK)).select("id");
    if (!error) inserted += data?.length ?? 0;
  }

  // 3. Marcar campaña completada y actualizar contadores
  await sb.from("campanias").update({
    estado: "completada",
    completada_at: new Date().toISOString(),
    total_enviados: inserted,
  }).eq("id", camp.id);

  // 4. Si vino template_id, incrementar uso
  if (template_id) {
    await sb.rpc("noop"); // placeholder
    const { data: t } = await sb.from("email_templates").select("veces_usado").eq("id", template_id).single();
    if (t) {
      await sb.from("email_templates").update({
        veces_usado: (t.veces_usado || 0) + 1,
        ultimo_uso: new Date().toISOString(),
      }).eq("id", template_id);
    }
  }

  return NextResponse.json({ ok: true, campania_id: camp.id, enviados: inserted });
}
