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
    nombre, tipo, template_id, template_meta, contenido, canal, destinatarios,
  } = body as {
    nombre: string;
    tipo: string;
    template_id?: string;
    template_meta?: string | null; // friendly_name de la template Meta-aprobada
    contenido?: string;
    canal: "whatsapp" | "email";
    destinatarios: Destinatario[];
  };

  if (!destinatarios?.length) return NextResponse.json({ error: "Sin destinatarios" }, { status: 400 });

  // Resolver template
  let cuerpo = contenido ?? "";
  let asunto: string | null = null;
  let templateName: string | null = template_meta ?? null;
  if (template_id) {
    const { data: t } = await sb.from("email_templates").select("cuerpo_texto, asunto, nombre").eq("id", template_id).single();
    if (t) { cuerpo = t.cuerpo_texto; asunto = t.asunto; templateName = templateName ?? t.nombre; }
  }
  if (!cuerpo.trim() && !template_meta) {
    return NextResponse.json({ error: "Sin contenido" }, { status: 400 });
  }

  // Si usa template Meta-aprobada, resolvemos el Content SID (HX...) desde envs.
  // Mapping nombre → env var. NO hardcodeamos los SIDs aqui para que cuando
  // Meta apruebe nuevas versiones, solo se actualiza la env var.
  const TEMPLATE_SID_ENV: Record<string, string> = {
    reactivacion_dormida: "TWILIO_TEMPLATE_REACTIVACION_DORMIDA",
    aviso_retoque_60d: "TWILIO_TEMPLATE_AVISO_RETOQUE_60D",
    aviso_retoque_anual: "TWILIO_TEMPLATE_AVISO_RETOQUE_ANUAL",
    cumpleanos_cupon: "TWILIO_TEMPLATE_CUMPLEANOS_CUPON",
    recordatorio_cita_24h: "TWILIO_TEMPLATE_RECORDATORIO_CITA_24H",
    recordatorio_cita_2h: "TWILIO_TEMPLATE_RECORDATORIO_CITA_2H",
    confirmacion_cita_link_pago: "TWILIO_TEMPLATE_CONFIRMACION_CITA_LINK_PAGO",
    confirmacion_cita_valoracion: "TWILIO_TEMPLATE_CONFIRMACION_CITA_VALORACION",
    presentacion_gina_brows: "TWILIO_TEMPLATE_PRESENTACION_GINA_BROWS",
    pedir_resena_google: "TWILIO_TEMPLATE_PEDIR_RESENA_GOOGLE",
  };
  const templateSid = template_meta ? process.env[TEMPLATE_SID_ENV[template_meta]] ?? null : null;
  if (template_meta && !templateSid) {
    return NextResponse.json(
      { error: `Template '${template_meta}' no configurada en envs (${TEMPLATE_SID_ENV[template_meta]})` },
      { status: 500 }
    );
  }

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

  // 2. Filtrar opt-out de marketing — clientes con no_marketing=true se
  //    excluyen siempre, sin importar canal.
  const idsAll = destinatarios.map((d) => d.id);
  const { data: optOuts } = await sb
    .from("clientes")
    .select("id")
    .in("id", idsAll)
    .eq("no_marketing", true);
  const optOutSet = new Set((optOuts ?? []).map((c) => c.id));
  const optOutCount = optOutSet.size;

  // 3. Filtrar destinatarios validos (canal + opt-out)
  const filas = destinatarios.filter(
    (d) => (canal === "email" || d.whatsapp) && !optOutSet.has(d.id)
  );

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
        // Si hay templateSid (Meta-aprobada), usarlo. Funciona fuera de
        // ventana 24h. Si no, body libre (solo ventana activa).
        const sendArgs = templateSid
          ? {
              to: d.whatsapp,
              templateSid,
              templateVars: vars,
              templateName: templateName ?? nombre,
              clienteId: d.id,
              campaniaId: camp.id,
            }
          : {
              to: d.whatsapp,
              body: personalizado,
              clienteId: d.id,
              campaniaId: camp.id,
              templateName: templateName ?? nombre,
            };
        const result = await sendWhatsApp(sb, sendArgs);
        if (result.ok) inserted++;
        else failed++;
        // Throttle conservador: 6s entre mensajes = 10/min = 600/hora.
        // Twilio recomienda <100/min para cuentas nuevas; vamos super
        // por debajo para evitar ratelimit + dar tiempo a status callbacks.
        await new Promise((r) => setTimeout(r, 6000));
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
    opt_outs_excluidos: optOutCount,
    usa_template_meta: !!templateSid,
    modo: modoReal ? "real" : "simulado",
  });
}
