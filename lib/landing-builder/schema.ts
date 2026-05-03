// ============================================================================
// PropelKap OS · Landing Builder · Schema Types
// ============================================================================
// Tipos compartidos entre el CRM (editor) y el renderer (propelkap-os-landing).
// El payload jsonb que se publica al HUB sigue exactamente PublishedLanding.
// ============================================================================

export type SectionKind =
  | 'hero'
  | 'propuesta_valor'
  | 'beneficios'
  | 'testimonios'
  | 'proceso'
  | 'faq'
  | 'cta'
  | 'sobre_mi';

export type BrandVoice = 'formal' | 'cercano_usted' | 'cercano_tu' | 'experto';
export type FontFamily = 'inter' | 'playfair' | 'manrope';

export interface LandingConfig {
  brand_name: string;
  logo_url?: string | null;
  colors: { primary: string; accent: string; bg: string; text: string };
  font: FontFamily;
  brand_voice: BrandVoice;
  tagline?: string;
  contact?: {
    whatsapp?: string;
    email?: string;
    calcom_url?: string;
  };
}

// Contenido por kind (cada uno es jsonb en pk_landing_sections.content)
export interface HeroContent {
  headline: string;
  subheadline: string;
  cta_text: string;
  cta_url: string;
  bg_image_url?: string;
}

export interface PropuestaValorContent {
  titulo: string;
  parrafo: string;
}

export interface BeneficioItem {
  icon: string; // emoji o nombre lucide
  titulo: string;
  descripcion: string;
}
export interface BeneficiosContent {
  titulo: string;
  items: BeneficioItem[];
}

export interface TestimonioItem {
  nombre: string;
  foto_url?: string;
  texto: string;
  rating?: number; // 1-5
}
export interface TestimoniosContent {
  titulo: string;
  items: TestimonioItem[];
}

export interface ProcesoPaso {
  numero: number;
  titulo: string;
  descripcion: string;
}
export interface ProcesoContent {
  titulo: string;
  pasos: ProcesoPaso[];
}

export interface FaqItem {
  pregunta: string;
  respuesta: string;
}
export interface FaqContent {
  titulo: string;
  items: FaqItem[];
}

export interface CtaContent {
  headline: string;
  subheadline: string;
  button_text: string;
  button_url: string;
}

export interface SobreMiContent {
  titulo: string;
  foto_url?: string;
  bio_corta: string;
  certificaciones?: string[];
}

export type SectionContent =
  | HeroContent
  | PropuestaValorContent
  | BeneficiosContent
  | TestimoniosContent
  | ProcesoContent
  | FaqContent
  | CtaContent
  | SobreMiContent;

export interface LandingSection {
  kind: SectionKind;
  position: number;
  enabled: boolean;
  content: SectionContent | Record<string, never>;
}

// Payload que se publica al HUB (ver migration hub: pk_landings_published)
export interface PublishedLanding {
  slug: string;
  config: LandingConfig;
  sections: LandingSection[];
  version: number;
  published_at: string;
}

// ----------------------------------------------------------------------------
// AI · acciones disponibles del agente
// ----------------------------------------------------------------------------
export type AiAction = 'generate' | 'refine' | 'alternatives' | 'translate_tone';

export interface AiGenerateRequest {
  landing_id: string;
  section_kind: SectionKind;
  action: AiAction;
  user_input?: string;
  current_content?: SectionContent;
  target_tone?: BrandVoice;
}

export interface AiGenerateResponse {
  ok: true;
  content: SectionContent;
  alternatives?: SectionContent[];
  meta: {
    model: string;
    used_today: number;
    daily_limit: number;
    tokens: { input: number; output: number; cached: number };
    cost_usd: number;
  };
}

export interface AiErrorResponse {
  ok: false;
  error: string;
  used_today?: number;
  daily_limit?: number;
}

// ----------------------------------------------------------------------------
// Caps de output por sección (max_tokens explícito → control de costos)
// ----------------------------------------------------------------------------
export const SECTION_MAX_TOKENS: Record<SectionKind, number> = {
  hero: 200,
  propuesta_valor: 250,
  beneficios: 400,
  sobre_mi: 350,
  proceso: 450,
  testimonios: 100, // testimonios los escribe el cliente; AI solo pule
  faq: 600,
  cta: 150,
};

// ----------------------------------------------------------------------------
// Pricing tokens (USD por 1M tokens · pricing 2026-Q1 anchored)
// ----------------------------------------------------------------------------
export const TOKEN_PRICING = {
  'claude-haiku-4-5-20251001': {
    input: 0.8 / 1_000_000,
    cached_input: 0.08 / 1_000_000, // 90% off cached
    output: 4 / 1_000_000,
  },
  'claude-sonnet-4-6': {
    input: 3 / 1_000_000,
    cached_input: 0.3 / 1_000_000,
    output: 15 / 1_000_000,
  },
} as const;

export function calcCostUsd(
  model: keyof typeof TOKEN_PRICING,
  tokens: { input: number; output: number; cached: number }
): number {
  const p = TOKEN_PRICING[model];
  const fresh_input = Math.max(0, tokens.input - tokens.cached);
  return (
    fresh_input * p.input +
    tokens.cached * p.cached_input +
    tokens.output * p.output
  );
}
