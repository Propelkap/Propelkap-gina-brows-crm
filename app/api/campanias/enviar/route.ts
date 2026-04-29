import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsApp, isWhatsAppConfigured, aplicarVariables } from "@/lib/whatsapp";
import { Resend } from "resend";

export const runtime = "nodejs";
export const maxDuration = 60;

type Destinatario = { id: string; nombre: string; whatsapp: string | null };

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    nombre, tipo, template_id, contenido, canal, destinatarios,
  } = body as {
    nombre: string;
    tipo: string;
    template_id?: string;
    contenido?: string;
    canal: "whatsapp" | "email";
    destinatarios: Destinatario[];
  };

  if (!destinatarios?.length) return NextResponse.json({ error: "Sin destinatarios" }, { status: 400 });

  // Resolver template
  let cuerpo = contenido ?? "";
  let asunto: string | null = null;
  let templateName: string | null = null;
  if (template_id) {
    const { data: t } = await sb.from("email_templates").select("cuerpo_texto, asunto, nombre").eq("id", template_id).single();
    if (t) { cuerpo = t.cuerpo_texto; asunto = t.asunto; templateName = t.nombre; }
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

  // 2. Enviar uno por uno
  const filas = destinatarios.filter((d) => canal === "email" || d.whatsapp);

  // Email setup
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM ?? "Gina Brows <hola@ginabrows.com>";
  const replyTo = process.env.REPLY_TO;
  const resend = resendKey ? new Resend(resendKey) : null;

  let inserted = 0;
  let failed = 0;
  const modoReal = canal === "whatsapp" ? isWhatsAppConfigured() : !!resend;

  // Para email, necesitamos cargar emails de los destinatarios
  let emailMap = new Map<string, string>();
  if (canal === "email") {
    const ids = filas.map((d) => d.id);
    const { data: clientes } = await sb.from("clientes").select("id, email").in("id", ids);
    clientes?.forEach((c) => { if (c.email) emailMap.set(c.id, c.email); });
  }

  for (const d of filas) {
    const vars: Record<string, string> = {
      nombre: (d.nombre || "").split(" ")[0] || "",
      apellido: (d.nombre || "").split(" ").slice(1).join(" ") || "",
    };
    const personalizado = aplicarVariables(cuerpo, vars);

    try {
      if (canal === "whatsapp") {
        if (!d.whatsapp) continue;
        const result = await sendWhatsApp(sb, {
          to: d.whatsapp,
          body: personalizado,
          clienteId: d.id,
          campaniaId: camp.id,
          templateName: templateName ?? nombre,
        });
        if (result.ok) inserted++;
        else failed++;
        // throttle defensivo: 50 mensajes/min máx (1.2s entre cada uno)
        await new Promise((r) => setTimeout(r, 1200));
      } else if (canal === "email") {
        const email = emailMap.get(d.id);
        if (!email || !resend) continue;
        await resend.emails.send({
          from: fromAddr,
          to: [email],
          replyTo: replyTo,
          subject: aplicarVariables(asunto || nombre, vars),
          text: personalizado,
        });
        // Registrar en comunicaciones
        await sb.from("comunicaciones").insert({
          cliente_id: d.id,
          canal: "email",
          direccion: "saliente",
          asunto: aplicarVariables(asunto || nombre, vars),
          cuerpo: personalizado,
          template_usado: templateName || nombre,
          campania_id: camp.id,
          estado_entrega: "sent",
        });
        inserted++;
      }
    } catch (e) {
      console.error("Send error:", e);
      failed++;
    }
  }

  // 3. Marcar campaña completada
  await sb.from("campanias").update({
    estado: "completada",
    completada_at: new Date().toISOString(),
    total_enviados: inserted,
  }).eq("id", camp.id);

  // 4. Incrementar uso template
  if (template_id) {
    const { data: t } = await sb.from("email_templates").select("veces_usado").eq("id", template_id).single();
    if (t) {
      await sb.from("email_templates").update({
        veces_usado: (t.veces_usado || 0) + 1,
        ultimo_uso: new Date().toISOString(),
      }).eq("id", template_id);
    }
  }

  return NextResponse.json({
    ok: true,
    campania_id: camp.id,
    enviados: inserted,
    fallidos: failed,
    modo: modoReal ? "real" : "simulado",
  });
}
