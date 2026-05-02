/**
 * Bot IA conversacional con voz Gina.
 * - Lee voz de marca de configuracion (frases si/no + system prompt)
 * - Inyecta últimos 5 feedbacks 'down' como ejemplos correctivos
 * - Mantiene contexto de los últimos 10 mensajes de la conversación
 * - Conoce el catálogo de servicios y horarios para dar info correcta
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

type Mensaje = { role: "user" | "assistant"; content: string };

export async function generarRespuestaBot(
  sb: SupabaseClient,
  clienteId: string,
  mensajeEntrante: string
): Promise<{ respuesta: string; tokens?: { in: number; out: number } } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // 1. Cargar config + clienta + historial + correcciones del bot + servicios
  const [confRes, clienteRes, historialRes, feedbacksRes, serviciosRes] = await Promise.all([
    sb.from("configuracion").select("*").eq("id", 1).single(),
    sb.from("clientes").select("nombre, apellido, total_citas, ultima_cita_fecha, fecha_nacimiento").eq("id", clienteId).single(),
    sb.from("comunicaciones")
      .select("direccion, cuerpo, enviado_at")
      .eq("cliente_id", clienteId)
      .eq("canal", "whatsapp")
      .order("enviado_at", { ascending: false })
      .limit(10),
    sb.from("bot_feedback")
      .select("mensaje_original, mensaje_corregido, contexto")
      .eq("tipo", "down")
      .not("mensaje_corregido", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
    sb.from("servicios").select("nombre, precio_mxn, duracion_min, retoque_dias_obligatorio").eq("visible", true).order("orden"),
  ]);

  const config = confRes.data;
  const cliente = clienteRes.data;
  const historial = (historialRes.data ?? []).reverse(); // ascendente
  const feedbacks = feedbacksRes.data ?? [];
  const servicios = serviciosRes.data ?? [];

  // 2. Construir system prompt
  const frasesSi = (config?.frases_si ?? []).join(" / ");
  const frasesNo = (config?.frases_no ?? []).join(" / ");
  const vozBase = config?.voz_bot_system_prompt ?? "";

  const horarios = config?.horarios as Record<string, { abre: string; cierra: string } | null> | null;
  const horariosTxt = horarios
    ? Object.entries(horarios).map(([dia, h]) => h ? `${dia}: ${h.abre}-${h.cierra}` : `${dia}: cerrado`).join(" · ")
    : "L-V 11:00-19:00 · Sáb 11:00-15:00 · Dom cerrado";

  const catalogoTxt = servicios
    .map((s) => `${s.nombre}: $${Number(s.precio_mxn).toFixed(0)} (${s.duracion_min} min${s.retoque_dias_obligatorio ? `, retoque a ${s.retoque_dias_obligatorio} días` : ""})`)
    .join("\n");

  const correccionesTxt = feedbacks.length > 0
    ? "\n\nCorrecciones que la dueña te ha enseñado (NO repitas estos errores):\n" + feedbacks.map((f, i) => `\n${i + 1}. ❌ NO digas: "${f.mensaje_original}"\n   ✅ MEJOR: "${f.mensaje_corregido}"${f.contexto ? `\n   Contexto: ${f.contexto}` : ""}`).join("\n")
    : "";

  const clienteCtx = cliente
    ? `Información de la clienta con la que hablas:
- Nombre: ${cliente.nombre} ${cliente.apellido ?? ""}
- Citas previas en el estudio: ${cliente.total_citas}
- Última cita: ${cliente.ultima_cita_fecha ?? "ninguna aún"}
- Cumpleaños: ${cliente.fecha_nacimiento ?? "no registrado"}`
    : "Es una clienta nueva, no tienes datos previos de ella.";

  const systemPrompt = `${vozBase}

FRASES QUE SÍ USAS: ${frasesSi}
FRASES QUE NUNCA USAS: ${frasesNo}

REGLAS DE CONVERSACIÓN:
- Empiezas con "Hello, hello" si es el primer mensaje del día
- Hablas de "cejitas" en diminutivo cariñoso
- Tono cálido, profesional, empático, natural
- Mensajes CORTOS (máx 3 oraciones) — si es complejo, divide en mensajes
- Si la clienta pregunta por precios, da el precio exacto del catálogo
- Si pregunta por horarios, usa los horarios oficiales
- Si pide cita: NO confirmes hora hasta que la dueña lo apruebe — en su lugar di "déjame checar disponibilidad y te confirmo en cuanto pueda"
- Si pregunta algo médico o sensible (alergias, contraindicaciones, problemas con su microblading): NO improvises, di "déjame que la dueña te conteste personalmente"
- Si dice "hola" sin contexto, presenta brevemente: "Hello, hello 🌿 Soy el asistente de Gina Brows. ¿En qué te puedo ayudar?"
- NO inventes promociones que no estén oficialmente activas
- NO prometas plazos exactos de respuesta cuando no los sepas

REGLA CRÍTICA — TRABAJO PREVIO:
Si la clienta menciona que YA TIENE algún trabajo previo en cejas (microblading antiguo, tatuaje en cejas, micropigmentación previa, "ya me hice", "tengo cejas tatuadas", "me hicieron en otro lado", manchas de pigmento viejo, etc.), Gina SIEMPRE ofrece primero una CITA DE VALORACIÓN ($300, 30 min) antes de agendar microblading o remoción.
- En la valoración Gina revisa físicamente las cejas de la clienta y define qué procedimiento aplica (retoque, remoción, microblading nuevo, etc.).
- NO prometas que se le hará microblading o remoción directo. Sugiere la valoración primero.
- Ejemplo de respuesta: "Hello, hello 🌿 Como ya tienes trabajo previo, lo mejor es que primero te aparte una valoración ($300) para revisar tus cejitas en persona y definir juntas el procedimiento ideal. ¿Te parece?"
- Solo si la clienta INSISTE explícitamente en que quiere directo el procedimiento sin valoración, escala a la dueña: "déjame que la dueña te conteste personalmente para coordinar".

HORARIOS DEL ESTUDIO: ${horariosTxt}

CATÁLOGO DE SERVICIOS:
${catalogoTxt}

${clienteCtx}
${correccionesTxt}

Responde SIEMPRE en español, en la voz de Gina, máximo 3 oraciones.`;

  // 3. Construir historial de mensajes (incluyendo el nuevo)
  const messages: Mensaje[] = historial.map((h) => ({
    role: h.direccion === "entrante" ? "user" : "assistant" as const,
    content: h.cuerpo,
  }));
  messages.push({ role: "user", content: mensajeEntrante });

  // 4. Llamar Claude con retry exponencial para errores transitorios (rate limits, 5xx)
  const client = new Anthropic({ apiKey });
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")
        .trim();

      return {
        respuesta: text,
        tokens: { in: response.usage.input_tokens, out: response.usage.output_tokens },
      };
    } catch (e) {
      const err = e as { status?: number; message?: string };
      const isTransient = err.status === 429 || err.status === 503 || err.status === 529 || (err.status ?? 0) >= 500;
      const lastAttempt = attempt === maxRetries - 1;

      if (!isTransient || lastAttempt) {
        console.error(`Bot AI error (attempt ${attempt + 1}/${maxRetries}):`, err.message ?? e);
        // Fallback graceful: mensaje educado en voz Gina si no podemos generar respuesta
        if (lastAttempt && isTransient) {
          return {
            respuesta: "Hello, hello 🌿 Dame un momentito y te contesto en cuanto pueda. Si es urgente, escríbeme directo y respondo personal 💜",
          };
        }
        return null;
      }

      // Backoff exponencial: 1s, 2s, 4s
      const waitMs = 1000 * Math.pow(2, attempt);
      console.warn(`Bot AI rate-limited (attempt ${attempt + 1}/${maxRetries}), retry in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  return null;
}
