/**
 * POST /api/ai/landing-generate
 * ----------------------------------------------------------------------------
 * Genera/refine/alternativas de UNA sección de la landing con Claude Haiku 4.5.
 * Usa prompt caching (cache_control: ephemeral) en el system prompt para
 * ahorrar 90% en tokens de los próximos calls del mismo cliente.
 *
 * Rate limit por landing/24h:
 *   - plan_tier='mensual' → 50 calls/día
 *   - plan_tier='anual'   → 200 calls/día
 *
 * Cap de output con max_tokens explícito por kind (SECTION_MAX_TOKENS).
 *
 * Modelo:
 *   - Default: claude-haiku-4-5-20251001 (95% de los calls)
 *   - Sonnet 4.6 SOLO si action='translate_tone' o user_input >300 chars
 *
 * API key: lee process.env.ANTHROPIC_API_KEY del Vercel project del cliente.
 */
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/landing-builder/prompts';
import {
  SECTION_MAX_TOKENS,
  calcCostUsd,
  type AiGenerateRequest,
  type AiGenerateResponse,
  type AiErrorResponse,
} from '@/lib/landing-builder/schema';

export const runtime = 'nodejs';
export const maxDuration = 30;

const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json<AiErrorResponse>(
      { ok: false, error: 'ANTHROPIC_API_KEY no configurada en este proyecto' },
      { status: 503 }
    );
  }

  let body: AiGenerateRequest;
  try {
    body = (await req.json()) as AiGenerateRequest;
  } catch {
    return NextResponse.json<AiErrorResponse>(
      { ok: false, error: 'invalid_json' },
      { status: 400 }
    );
  }

  const { landing_id, section_kind, action, user_input, current_content, target_tone } = body;
  if (!landing_id || !section_kind || !action) {
    return NextResponse.json<AiErrorResponse>(
      { ok: false, error: 'missing_required_fields' },
      { status: 400 }
    );
  }

  const sb = await createClient();

  // 1) Rate limit atómico (RPC race-safe)
  const { data: quotaCheck, error: quotaErr } = await sb.rpc(
    'pk_landing_check_and_increment_quota',
    { _landing_id: landing_id }
  );
  if (quotaErr) {
    return NextResponse.json<AiErrorResponse>(
      { ok: false, error: `quota_check_failed: ${quotaErr.message}` },
      { status: 500 }
    );
  }
  const quota = Array.isArray(quotaCheck) ? quotaCheck[0] : quotaCheck;
  if (!quota?.allowed) {
    return NextResponse.json<AiErrorResponse>(
      {
        ok: false,
        error: 'daily_limit_reached',
        used_today: quota?.used_today,
        daily_limit: quota?.daily_limit,
      },
      { status: 429 }
    );
  }

  // 2) Cargar config de la landing
  const { data: landing, error: landingErr } = await sb
    .from('pk_landings')
    .select('id, slug, config')
    .eq('id', landing_id)
    .single();
  if (landingErr || !landing) {
    return NextResponse.json<AiErrorResponse>(
      { ok: false, error: 'landing_not_found' },
      { status: 404 }
    );
  }

  // 3) Decidir modelo
  const useSonnet =
    action === 'translate_tone' || (user_input && user_input.length > 300);
  const model = useSonnet ? SONNET : HAIKU;
  const max_tokens = SECTION_MAX_TOKENS[section_kind] * (action === 'alternatives' ? 3 : 1);

  // 4) Build prompts
  const system = buildSystemPrompt(landing.config);
  const userPrompt = buildUserPrompt({
    kind: section_kind,
    action,
    user_input,
    current_content,
    target_tone,
  });

  // 5) Llamar a Claude (con prompt caching)
  const client = new Anthropic({ apiKey });
  let aiResponse;
  try {
    aiResponse = await client.messages.create({
      model,
      max_tokens,
      system: [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (err) {
    return NextResponse.json<AiErrorResponse>(
      { ok: false, error: `claude_call_failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // 6) Parse JSON del output
  const textBlock = aiResponse.content.find((c) => c.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';
  let parsed: any;
  try {
    // Tolerar fences ```json a pesar de pedir solo JSON
    const cleaned = rawText.replace(/^```json\s*|^```\s*|```$/gm, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json<AiErrorResponse>(
      { ok: false, error: 'invalid_json_from_claude' },
      { status: 502 }
    );
  }

  // 7) Calcular costo y registrar
  const usage = aiResponse.usage;
  const tokens = {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cached:
      (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
  };
  const cost_usd = calcCostUsd(model as keyof typeof import('@/lib/landing-builder/schema').TOKEN_PRICING, tokens);

  await sb.from('pk_landing_ai_calls').insert({
    landing_id,
    section_kind,
    action,
    model,
    prompt_tokens: tokens.input,
    completion_tokens: tokens.output,
    cached_tokens: tokens.cached,
    cost_usd,
    user_input: user_input?.slice(0, 500) ?? null,
  });

  // 8) Si fue 'generate' o 'refine', guardar en pk_landing_sections
  if (action === 'generate' || action === 'refine' || action === 'translate_tone') {
    await sb
      .from('pk_landing_sections')
      .update({
        content: parsed,
        ai_generations_count: undefined, // SQL increment via RPC sería ideal; lo dejamos a UI
        last_ai_generated_at: new Date().toISOString(),
      })
      .eq('landing_id', landing_id)
      .eq('kind', section_kind);
  }

  const response: AiGenerateResponse = {
    ok: true,
    content: action === 'alternatives' ? parsed.alternatives?.[0] : parsed,
    alternatives: action === 'alternatives' ? parsed.alternatives : undefined,
    meta: {
      model,
      used_today: quota.used_today,
      daily_limit: quota.daily_limit,
      tokens,
      cost_usd,
    },
  };

  return NextResponse.json(response);
}
