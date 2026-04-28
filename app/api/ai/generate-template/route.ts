/**
 * Generador de templates con IA usando Claude.
 * Toma una idea suelta + tipo (email/whatsapp) + audiencia, y devuelve un mensaje
 * en la voz de Gina (lee frases_si/frases_no/voz_bot_system_prompt de configuracion).
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 503 });

  const { idea, tipo, audiencia, longitud } = await req.json() as {
    idea: string;
    tipo: "email" | "whatsapp";
    audiencia?: string;
    longitud?: "corto" | "medio" | "largo";
  };

  if (!idea?.trim()) return NextResponse.json({ error: "Falta la idea" }, { status: 400 });

  // Cargar la voz de Gina desde configuración
  const { data: config } = await sb.from("configuracion").select("frases_si, frases_no, voz_bot_system_prompt").eq("id", 1).single();
  const frasesSi = (config?.frases_si ?? []).join(" / ");
  const frasesNo = (config?.frases_no ?? []).join(" / ");
  const vozGina = config?.voz_bot_system_prompt ?? "";

  // Recolectar últimos 5 feedbacks 'down' para que la IA no repita errores conocidos
  const { data: feedbacks } = await sb
    .from("bot_feedback")
    .select("mensaje_original, mensaje_corregido")
    .eq("tipo", "down")
    .not("mensaje_corregido", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);

  const feedbackEjemplos = (feedbacks ?? [])
    .map((f, i) => `Ejemplo ${i + 1}:\n  ❌ Mal: "${f.mensaje_original}"\n  ✅ Mejor: "${f.mensaje_corregido}"`)
    .join("\n\n");

  const lenLabel = {
    corto: "1-2 oraciones (máx 200 caracteres)",
    medio: "3-5 oraciones (300-500 caracteres)",
    largo: "1-2 párrafos completos",
  }[longitud ?? "medio"];

  const formatoTipo = tipo === "email"
    ? `Devuelve JSON: {"asunto": "...", "cuerpo": "..."}. El asunto < 50 chars, sin emoji al inicio. El cuerpo puede tener saltos de línea con \\n.`
    : `Devuelve JSON: {"cuerpo": "..."}. UN solo bloque de texto, lo que se manda por WhatsApp.`;

  const systemPrompt = `Eres copywriter de marca para Gina Torres, dueña de "Gina Brows Microblading Artist" en Monterrey.

Voz de Gina:
${vozGina}

Frases que SÍ usa: ${frasesSi || "Hello, hello / cejitas / Las cejas son hermanas, no gemelas"}
Frases que NUNCA usa: ${frasesNo || "groserías / palabras despectivas"}

${feedbackEjemplos ? `Correcciones que la dueña te ha enseñado (NO repetir estos errores):\n${feedbackEjemplos}\n` : ""}

Reglas estrictas:
- Empieza siempre con "Hello, hello" si es WhatsApp (en email puede variar)
- Habla de "cejitas" en diminutivo cariñoso
- Nunca uses lenguaje formal robótico
- Tono cálido, empático, natural
- Si vas a personalizar con el nombre, usa exactamente: {{nombre}}
- Otras variables disponibles si aplican: {{cumpleanos}}, {{ultima_cita}}, {{cupon}}, {{link_resena}}, {{link_pago}}
- ${formatoTipo}
- Solo regresa el JSON, sin explicación adicional.`;

  const userPrompt = `Tipo: ${tipo}
Audiencia: ${audiencia || "clienta del estudio"}
Longitud: ${lenLabel}

Idea de Gina:
"${idea}"

Genera el mensaje listo para enviar.`;

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Extraer JSON (el modelo a veces lo envuelve en ```json)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Respuesta sin JSON válido", raw: text }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      ok: true,
      asunto: parsed.asunto ?? null,
      cuerpo: parsed.cuerpo ?? "",
      tokens_in: response.usage.input_tokens,
      tokens_out: response.usage.output_tokens,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
