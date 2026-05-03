// ============================================================================
// PropelKap OS · Landing Builder · Prompts del agente
// ============================================================================
// CADA prompt es CORTO y ESPECÍFICO por sección. NO hay un mega-prompt que
// genere toda la landing. El system prompt se cachea (cache_control: ephemeral)
// para ahorrar 90% en tokens en los próximos calls del mismo cliente.
// ============================================================================

import type {
  SectionKind,
  AiAction,
  LandingConfig,
  SectionContent,
} from './schema';

const VOICE_DESC: Record<string, string> = {
  formal:
    'tono profesional y distante, hablando SIEMPRE de "usted". Sin emojis. Frases completas.',
  cercano_usted:
    'tono cálido y empático, hablando SIEMPRE de "usted". Sin sonar acartonado. Emojis con moderación (1-2 max por sección).',
  cercano_tu:
    'tono cálido y cercano, tuteando al lector ("tú", "te", "tus"). Conversacional. Emojis con moderación (1-2 max por sección).',
  experto:
    'tono autoritativo y directo, basado en datos. Hablando SIEMPRE de "usted". Sin emojis.',
};

export function buildSystemPrompt(config: LandingConfig): string {
  const voice = VOICE_DESC[config.brand_voice ?? 'cercano_usted'];
  return `Eres copywriter especialista en landing pages de servicios financieros para el mercado mexicano.

CONTEXTO DEL CLIENTE:
- Marca: ${config.brand_name}
- Tono de voz: ${voice}
- Tagline (si existe): ${config.tagline ?? '(no definido)'}

REGLAS DURAS:
1. Habla SIEMPRE en español de México con el tono especificado arriba (tutea/usted como indique). Si el tono dice tutear ("tú"), NUNCA uses "usted" o "le". Si el tono dice "usted", NUNCA uses "tú" o "te".
2. Devuelve SIEMPRE JSON válido. Sin markdown ni texto adicional.
3. NUNCA prometas montos exactos, "garantías" de pensión, ni cifras específicas (ej. "$50,000 al mes garantizado"). Usa frases como "puede mejorar significativamente su pensión" o "muchos clientes han logrado X".
4. Cumple las leyes de publicidad financiera mexicana: nada de "el mejor", "único", "líder" sin sustento.
5. Sé CONCISO. Cada texto debe poder leerse en <5 segundos.
6. Si el cliente pide reescribir con feedback, MEJORA el actual sin perder el sentido — no inventes.

ESTILO DE COPY:
- Headlines: <12 palabras, beneficio claro, no clickbait.
- Sub-headlines: <25 palabras, expanden el headline.
- Listas: 3-5 items, paralelas en estructura.
- Beneficios: empieza con verbo de acción ("Recibe", "Calcula", "Conoce").
- FAQs: pregunta natural en 1ra persona del cliente, respuesta directa <50 palabras.`;
}

// ----------------------------------------------------------------------------
// Schema esperado por sección (le decimos a Claude qué JSON devolver)
// ----------------------------------------------------------------------------
const SCHEMA_BY_KIND: Record<SectionKind, string> = {
  hero: `{
  "headline": "string · 6-12 palabras · beneficio principal",
  "subheadline": "string · 15-25 palabras · explica QUÉ haces",
  "cta_text": "string · 2-4 palabras · acción imperativa (ej. 'Agenda diagnóstico gratis')",
  "cta_url": "string · si user_input no incluye URL, devuelve '#contacto'"
}`,
  propuesta_valor: `{
  "titulo": "string · 4-8 palabras",
  "parrafo": "string · 40-70 palabras · explica POR QUÉ el cliente debe escogerte"
}`,
  beneficios: `{
  "titulo": "string · 4-6 palabras (ej. 'Por qué elegirnos')",
  "items": [
    {"icon": "emoji o nombre simple", "titulo": "string 3-5 palabras", "descripcion": "string 15-25 palabras"}
  ] · entre 3 y 5 items
}`,
  testimonios: `{
  "titulo": "string · 3-5 palabras (ej. 'Lo que dicen nuestros clientes')"
}`,
  proceso: `{
  "titulo": "string · 3-5 palabras (ej. 'Cómo trabajamos')",
  "pasos": [
    {"numero": int, "titulo": "string 3-5 palabras", "descripcion": "string 15-25 palabras"}
  ] · entre 3 y 5 pasos
}`,
  faq: `{
  "titulo": "string · 3-5 palabras (ej. 'Preguntas frecuentes')",
  "items": [
    {"pregunta": "string · 8-15 palabras · cómo lo preguntaría un cliente real", "respuesta": "string · 30-50 palabras · directa, sin promesas"}
  ] · entre 5 y 8 items
}`,
  cta: `{
  "headline": "string · 6-10 palabras · llamado final",
  "subheadline": "string · 15-25 palabras · razón para actuar ahora",
  "button_text": "string · 2-4 palabras · acción imperativa",
  "button_url": "string · si user_input no incluye URL, devuelve '#contacto'"
}`,
  sobre_mi: `{
  "titulo": "string · 3-5 palabras (ej. 'Sobre mí' o 'Quién soy')",
  "bio_corta": "string · 60-100 palabras · 3ra persona · profesión + años experiencia + diferencial",
  "certificaciones": ["string · cada una 3-8 palabras"] · entre 2 y 5 items, opcional
}`,
};

// ----------------------------------------------------------------------------
// User prompt builder — corto y directo según action
// ----------------------------------------------------------------------------
export function buildUserPrompt(args: {
  kind: SectionKind;
  action: AiAction;
  user_input?: string;
  current_content?: SectionContent;
  target_tone?: string;
}): string {
  const { kind, action, user_input, current_content, target_tone } = args;
  const schema = SCHEMA_BY_KIND[kind];
  const inputDesc = user_input ? `\n\nINFO DEL CLIENTE:\n${user_input}` : '';

  switch (action) {
    case 'generate':
      return `Genera la sección "${kind}" desde cero.${inputDesc}

Devuelve EXACTAMENTE este JSON:
${schema}`;

    case 'refine':
      return `Mejora la sección "${kind}" actual con este feedback del cliente.

CONTENIDO ACTUAL:
${JSON.stringify(current_content ?? {}, null, 2)}

FEEDBACK DEL CLIENTE:
${user_input ?? '(haz el copy más claro y directo)'}

Devuelve EXACTAMENTE este JSON (mejora el contenido SIN inventar datos nuevos):
${schema}`;

    case 'alternatives':
      return `Genera 3 alternativas distintas para la sección "${kind}".${inputDesc}

CONTENIDO ACTUAL (referencia):
${JSON.stringify(current_content ?? {}, null, 2)}

Devuelve un objeto con clave "alternatives" que es un array de 3 objetos, cada uno siguiendo este schema:
${schema}

Las 3 alternativas deben tener ÁNGULOS DISTINTOS (ej. enfoque emocional vs racional vs aspiracional). Sin repetir frases.`;

    case 'translate_tone':
      return `Reescribe la sección "${kind}" cambiando el tono a "${target_tone}".

CONTENIDO ACTUAL:
${JSON.stringify(current_content ?? {}, null, 2)}

Mantén la información factual, solo cambia el tono. Devuelve EXACTAMENTE este JSON:
${schema}`;
  }
}
