/**
 * POST /api/landing/publish
 * ----------------------------------------------------------------------------
 * Toma el draft de la landing del cliente, arma el payload PublishedLanding y
 * lo envía al HUB de PropelKap (Edge Function `landing-publish-receiver`) que
 * hace upsert en `pk_landings_published`.
 *
 * El renderer multi-tenant (propelkap-os-landing.vercel.app) lee del HUB con
 * ISR 60s, así que ~1 minuto después de publicar la URL pública refresca.
 *
 * Body opcional: { unpublish: true } → marca status='paused' en el HUB.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PublishedLanding } from '@/lib/landing-builder/schema';

export const runtime = 'nodejs';
export const maxDuration = 30;

const HUB_URL = process.env.PROPELKAP_HUB_URL ?? 'https://hmwikgjihesyvfsqccfs.supabase.co';
const RECEIVER_PATH = '/functions/v1/landing-publish-receiver';
const HUB_INTERNAL_TOKEN = process.env.PROPELKAP_HUB_INTERNAL_TOKEN; // shared secret CRM↔HUB

export async function POST(req: Request) {
  if (!HUB_INTERNAL_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'PROPELKAP_HUB_INTERNAL_TOKEN no configurada' },
      { status: 503 }
    );
  }

  let unpublish = false;
  try {
    const body = await req.json().catch(() => ({}));
    unpublish = !!body.unpublish;
  } catch {
    /* no body OK */
  }

  const sb = await createClient();

  // 1) Cargar landing + secciones
  const { data: landing, error: landingErr } = await sb
    .from('pk_landings')
    .select('id, slug, config, status')
    .limit(1)
    .single();
  if (landingErr || !landing) {
    return NextResponse.json(
      { ok: false, error: 'landing_not_found · ¿corriste pk_landing_bootstrap?' },
      { status: 404 }
    );
  }

  if (unpublish) {
    // Marca paused en el HUB
    const r = await fetch(`${HUB_URL}${RECEIVER_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-auth': HUB_INTERNAL_TOKEN,
      },
      body: JSON.stringify({ slug: landing.slug, unpublish: true }),
    });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `hub_unpublish_failed: ${r.status}` },
        { status: 502 }
      );
    }
    await sb
      .from('pk_landings')
      .update({ status: 'paused' })
      .eq('id', landing.id);
    return NextResponse.json({ ok: true, action: 'unpublished' });
  }

  const { data: sections, error: secErr } = await sb
    .from('pk_landing_sections')
    .select('kind, position, enabled, content')
    .eq('landing_id', landing.id)
    .eq('enabled', true)
    .order('position', { ascending: true });
  if (secErr) {
    return NextResponse.json(
      { ok: false, error: `sections_query_failed: ${secErr.message}` },
      { status: 500 }
    );
  }

  // 2) Validar que las secciones core no estén vacías
  const required = ['hero', 'cta'];
  const missing = required.filter(
    (k) => !sections?.find((s) => s.kind === k && Object.keys(s.content ?? {}).length > 0)
  );
  if (missing.length) {
    return NextResponse.json(
      {
        ok: false,
        error: 'sections_required_empty',
        missing,
        hint: 'Llena al menos hero + cta antes de publicar',
      },
      { status: 400 }
    );
  }

  // 3) Armar payload
  const payload: PublishedLanding = {
    slug: landing.slug,
    config: landing.config,
    sections: (sections ?? []).map((s) => ({
      kind: s.kind,
      position: s.position,
      enabled: s.enabled,
      content: s.content,
    })),
    version: Date.now(), // version simple por timestamp
    published_at: new Date().toISOString(),
  };

  // 4) POST al HUB
  const r = await fetch(`${HUB_URL}${RECEIVER_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-auth': HUB_INTERNAL_TOKEN,
    },
    body: JSON.stringify({ slug: landing.slug, payload }),
  });
  if (!r.ok) {
    const txt = await r.text();
    return NextResponse.json(
      { ok: false, error: `hub_publish_failed: ${r.status} · ${txt}` },
      { status: 502 }
    );
  }

  // 5) Marcar como published localmente
  await sb
    .from('pk_landings')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', landing.id);

  return NextResponse.json({
    ok: true,
    action: 'published',
    slug: landing.slug,
    public_url: `https://${landing.slug}.os.propelkap.com`,
    propagation_note: 'ISR 60s · la URL refresca ~1 min después',
  });
}
