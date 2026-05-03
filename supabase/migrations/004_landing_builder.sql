-- ============================================================================
-- 004_landing_builder.sql · PropelKap OS · Landing Builder
-- ============================================================================
-- Crea las 3 tablas que permiten al cliente construir su landing pública
-- vía wizard impulsado por Claude (Haiku 4.5 default).
--
-- - pk_landings              · 1 fila por cliente · config global (marca, dominio)
-- - pk_landing_sections      · N filas · contenido por sección (jsonb)
-- - pk_landing_ai_calls      · N filas · tracking de uso de tokens IA
--
-- El renderer (propelkap-os-landing.vercel.app) NO lee directo de aquí, lee
-- del HUB en `pk_landings_published` después del flow "Publicar".
-- ============================================================================

-- 1) pk_landings — config global (1:1 con el tenant)
CREATE TABLE IF NOT EXISTS pk_landings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,            -- usado en <slug>.propelkap.com
  domain       text,                            -- custom domain si lo compró (fase 2)
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- config schema:
  -- {
  --   brand_name: string,
  --   logo_url: string | null,
  --   colors: { primary: string, accent: string, bg: string, text: string },
  --   font: 'inter' | 'playfair' | 'manrope',
  --   brand_voice: 'formal' | 'cercano' | 'experto',
  --   tagline: string,
  --   contact: { whatsapp: string, email: string, calcom_url: string }
  -- }
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused')),
  plan_tier    text NOT NULL DEFAULT 'mensual' CHECK (plan_tier IN ('mensual', 'anual')),
  ai_quota_today int NOT NULL DEFAULT 0,        -- contador rolling 24h
  ai_quota_reset_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pk_landings_slug ON pk_landings (slug);
CREATE INDEX IF NOT EXISTS idx_pk_landings_status ON pk_landings (status);

-- 2) pk_landing_sections — secciones de la landing (orden + contenido)
CREATE TABLE IF NOT EXISTS pk_landing_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id   uuid NOT NULL REFERENCES pk_landings(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN (
                  'hero', 'propuesta_valor', 'beneficios', 'testimonios',
                  'proceso', 'faq', 'cta', 'sobre_mi'
                )),
  position     int NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  content      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- content schema depende de kind:
  --   hero:            { headline, subheadline, cta_text, cta_url, bg_image_url? }
  --   propuesta_valor: { titulo, parrafo }
  --   beneficios:      { titulo, items: [{icon, titulo, descripcion}] }
  --   testimonios:     { titulo, items: [{nombre, foto_url?, texto, rating}] }
  --   proceso:         { titulo, pasos: [{numero, titulo, descripcion}] }
  --   faq:             { titulo, items: [{pregunta, respuesta}] }
  --   cta:             { headline, subheadline, button_text, button_url }
  --   sobre_mi:        { titulo, foto_url?, bio_corta, certificaciones[]? }
  ai_generations_count int NOT NULL DEFAULT 0,
  last_ai_generated_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (landing_id, kind),                    -- 1 sección por kind por landing
  UNIQUE (landing_id, position)                 -- orden único
);

CREATE INDEX IF NOT EXISTS idx_pk_landing_sections_landing ON pk_landing_sections (landing_id, position);

-- 3) pk_landing_ai_calls — tracking de uso de IA (para rate limit + auditoría)
CREATE TABLE IF NOT EXISTS pk_landing_ai_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id      uuid NOT NULL REFERENCES pk_landings(id) ON DELETE CASCADE,
  section_kind    text,
  action          text NOT NULL CHECK (action IN (
                    'generate', 'refine', 'alternatives', 'translate_tone'
                  )),
  model           text NOT NULL,                -- 'claude-haiku-4-5-20251001' o 'claude-sonnet-4-6'
  prompt_tokens   int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  cached_tokens   int NOT NULL DEFAULT 0,
  cost_usd        numeric(10, 6) NOT NULL DEFAULT 0,
  user_input      text,                         -- log corto para auditoría
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pk_landing_ai_calls_landing ON pk_landing_ai_calls (landing_id, created_at DESC);

-- 4) Trigger: updated_at automático
CREATE OR REPLACE FUNCTION pk_landing_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pk_landings_updated_at ON pk_landings;
CREATE TRIGGER pk_landings_updated_at BEFORE UPDATE ON pk_landings
  FOR EACH ROW EXECUTE FUNCTION pk_landing_set_updated_at();

DROP TRIGGER IF EXISTS pk_landing_sections_updated_at ON pk_landing_sections;
CREATE TRIGGER pk_landing_sections_updated_at BEFORE UPDATE ON pk_landing_sections
  FOR EACH ROW EXECUTE FUNCTION pk_landing_set_updated_at();

-- 5) RPC: incrementa contador uso IA y verifica quota (ATÓMICO, race-safe)
CREATE OR REPLACE FUNCTION pk_landing_check_and_increment_quota(_landing_id uuid)
RETURNS TABLE (allowed boolean, used_today int, daily_limit int) AS $$
DECLARE
  v_landing pk_landings;
  v_limit int;
BEGIN
  SELECT * INTO v_landing FROM pk_landings WHERE id = _landing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'landing_not_found';
  END IF;

  -- Reset rolling 24h
  IF v_landing.ai_quota_reset_at < now() - interval '24 hours' THEN
    UPDATE pk_landings
       SET ai_quota_today = 0, ai_quota_reset_at = now()
     WHERE id = _landing_id;
    v_landing.ai_quota_today := 0;
  END IF;

  v_limit := CASE v_landing.plan_tier WHEN 'anual' THEN 200 ELSE 50 END;

  IF v_landing.ai_quota_today >= v_limit THEN
    RETURN QUERY SELECT false, v_landing.ai_quota_today, v_limit;
    RETURN;
  END IF;

  UPDATE pk_landings
     SET ai_quota_today = ai_quota_today + 1
   WHERE id = _landing_id;

  RETURN QUERY SELECT true, v_landing.ai_quota_today + 1, v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) RLS: la landing es del cliente (admin del CRM) — solo authenticated puede tocarla
ALTER TABLE pk_landings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_landing_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pk_landing_ai_calls ENABLE ROW LEVEL SECURITY;

-- Admin del CRM ve todo (un solo cliente por DB en multi-tenant)
DROP POLICY IF EXISTS pk_landings_authenticated ON pk_landings;
CREATE POLICY pk_landings_authenticated ON pk_landings
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pk_landing_sections_authenticated ON pk_landing_sections;
CREATE POLICY pk_landing_sections_authenticated ON pk_landing_sections
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pk_landing_ai_calls_authenticated ON pk_landing_ai_calls;
CREATE POLICY pk_landing_ai_calls_authenticated ON pk_landing_ai_calls
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 7) Bootstrap: cada cliente arranca con 1 landing draft + 7 secciones default
CREATE OR REPLACE FUNCTION pk_landing_bootstrap(
  _slug text, _brand_name text, _plan_tier text DEFAULT 'mensual'
) RETURNS uuid AS $$
DECLARE
  v_landing_id uuid;
BEGIN
  INSERT INTO pk_landings (slug, plan_tier, config)
  VALUES (
    _slug,
    _plan_tier,
    jsonb_build_object(
      'brand_name', _brand_name,
      'colors', jsonb_build_object(
        'primary', '#0a2540', 'accent', '#00d4ff',
        'bg', '#ffffff', 'text', '#1a1a1a'
      ),
      'font', 'inter',
      'brand_voice', 'cercano_usted'
    )
  )
  RETURNING id INTO v_landing_id;

  -- 7 secciones default vacías
  INSERT INTO pk_landing_sections (landing_id, kind, position, content) VALUES
    (v_landing_id, 'hero', 1, '{}'::jsonb),
    (v_landing_id, 'propuesta_valor', 2, '{}'::jsonb),
    (v_landing_id, 'beneficios', 3, '{}'::jsonb),
    (v_landing_id, 'sobre_mi', 4, '{}'::jsonb),
    (v_landing_id, 'proceso', 5, '{}'::jsonb),
    (v_landing_id, 'testimonios', 6, '{}'::jsonb),
    (v_landing_id, 'faq', 7, '{}'::jsonb),
    (v_landing_id, 'cta', 8, '{}'::jsonb);

  RETURN v_landing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE pk_landings IS 'PropelKap OS Landing Builder · 1 landing por tenant';
COMMENT ON TABLE pk_landing_sections IS 'Secciones de la landing (orden + contenido jsonb)';
COMMENT ON TABLE pk_landing_ai_calls IS 'Auditoría uso Claude para rate limit y costos';
