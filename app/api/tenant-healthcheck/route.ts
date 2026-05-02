/**
 * GET /api/tenant-healthcheck
 *
 * Endpoint Next.js App Router que cada CRM-cliente expone para que el
 * dashboard cross-tenant en crm.propelkap.com pueda agregar métricas
 * operativas en tiempo real.
 *
 * Auth: opcional · Bearer token con TENANT_HEALTHCHECK_SECRET (env var) o
 *       X-Tenant-Secret header. Si no hay secret configurado, endpoint público.
 *
 * Cache headers: max-age=60s · stale-while-revalidate=300s
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''
const TENANT_SECRET = process.env.TENANT_HEALTHCHECK_SECRET ?? ''
const TENANT_SLUG = process.env.TENANT_SLUG ?? 'unknown'
const TENANT_PLAN = process.env.TENANT_PLAN ?? 'unknown'

// deno-lint-ignore no-explicit-any
type Json = any

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': 'https://crm.propelkap.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-tenant-secret, content-type',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function GET(req: NextRequest) {
  // Auth (opcional)
  if (TENANT_SECRET) {
    const headerToken =
      req.headers.get('x-tenant-secret') ??
      (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (headerToken !== TENANT_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
    }
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json(
      { error: 'supabase_env_missing' },
      { status: 500, headers: corsHeaders() },
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const startedAt = Date.now()

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      contactsAll,
      contactsRecent,
      waConvs,
      waMsgs24h,
      botMsgs24h,
      botFeedbackUp,
      botFeedbackDown,
    ] = await Promise.allSettled([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since7d),
      supabase
        .from('wa_conversations')
        .select('id, last_inbound_at', { count: 'exact' })
        .eq('status', 'active'),
      supabase
        .from('wa_messages')
        .select('id, direction, sent_by_user_id', { count: 'exact' })
        .gte('created_at', since24h),
      supabase
        .from('wa_messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since24h)
        .eq('direction', 'outbound')
        .is('sent_by_user_id', null),
      supabase
        .from('wa_message_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('feedback', 'up'),
      supabase
        .from('wa_message_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('feedback', 'down'),
    ])

    const safeCount = (r: PromiseSettledResult<{ count: number | null } | Json>): number => {
      if (r.status !== 'fulfilled') return 0
      const v = r.value as { count?: number | null }
      return v?.count ?? 0
    }

    let convsWindowClosed = 0
    let convsWindowOpen = 0
    if (waConvs.status === 'fulfilled') {
      const rows = ((waConvs.value as Json)?.data ?? []) as Array<{ last_inbound_at: string | null }>
      for (const r of rows) {
        if (!r.last_inbound_at) continue
        const ageMs = Date.now() - new Date(r.last_inbound_at).getTime()
        if (ageMs > 24 * 60 * 60 * 1000) convsWindowClosed++
        else convsWindowOpen++
      }
    }

    const fbUp = safeCount(botFeedbackUp)
    const fbDown = safeCount(botFeedbackDown)
    const fbTotal = fbUp + fbDown
    const fbUpPct = fbTotal > 0 ? Math.round((fbUp / fbTotal) * 100) : null

    const { data: lastWaMsg } = await supabase
      .from('wa_messages')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const payload = {
      ok: true,
      tenant: {
        slug: TENANT_SLUG,
        plan: TENANT_PLAN,
        timestamp: new Date().toISOString(),
        latency_ms: Date.now() - startedAt,
      },
      contacts: {
        total: safeCount(contactsAll),
        last_7d: safeCount(contactsRecent),
      },
      whatsapp: {
        active_conversations: safeCount(waConvs),
        window_open: convsWindowOpen,
        window_closed: convsWindowClosed,
        messages_last_24h: safeCount(waMsgs24h),
        bot_replies_last_24h: safeCount(botMsgs24h),
      },
      bot: {
        feedback_up_count: fbUp,
        feedback_down_count: fbDown,
        thumbs_up_pct: fbUpPct,
      },
      last_activity_at: (lastWaMsg as Json)?.created_at ?? null,
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: msg, tenant_slug: TENANT_SLUG },
      { status: 500, headers: corsHeaders() },
    )
  }
}
