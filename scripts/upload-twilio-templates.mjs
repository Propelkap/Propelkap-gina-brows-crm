#!/usr/bin/env node
/**
 * Sube las templates de WhatsApp Business a Twilio Content Builder
 * y las manda a aprobacion de Meta en bloque.
 *
 * Uso:
 *   node scripts/upload-twilio-templates.mjs --dry-run   (lista lo que va a hacer)
 *   node scripts/upload-twilio-templates.mjs             (las sube de a deveras)
 *
 * Requiere TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en .env.local.
 * Idempotente: si ya existe una template con el mismo friendly_name, la salta.
 *
 * Despues de correr, imprime un mapping friendly_name → ContentSid (HX...)
 * que se usa en lib/whatsapp.ts y los crons para enviar mensajes.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env.local");

// Carga rapida de .env.local sin dependencias
function loadEnv(path) {
  const txt = readFileSync(path, "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const SID = env.TWILIO_ACCOUNT_SID;
const TOKEN = env.TWILIO_AUTH_TOKEN;

if (!SID || !TOKEN) {
  console.error("❌ Falta TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en .env.local");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const auth = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");
const baseHeaders = { Authorization: auth };

// =========================================================================
// Templates a crear — orden = prioridad de uso
// IMPORTANTE: Meta requiere `variables` con un ejemplo concreto por cada
// placeholder {{N}} del body. Sin examples, rechaza con
// "component of type BODY is missing expected field(s) (example)".
// =========================================================================
const TEMPLATES = [
  {
    friendly_name: "recordatorio_cita_24h",
    category: "UTILITY",
    language: "es_MX",
    body: "Hello, hello {{1}} 🌿 Te recordamos tu cita mañana a las {{2}} para {{3}} en Gina Brows. Si necesitas reagendar, contéstanos a este mensaje 💜",
    variables: { "1": "María", "2": "10:00 AM", "3": "microblading" },
  },
  {
    friendly_name: "recordatorio_cita_2h",
    category: "UTILITY",
    language: "es_MX",
    // Meta rechaza si la variable esta al inicio o al final del body.
    // "Hola {{1}}, ..." mete texto antes del primer placeholder.
    body: "Hola {{1}}, te esperamos en 2 horas para tu cita de {{2}} en Gina Brows 🌿 Recuerda llegar 5 min antes. Cualquier cosa, contéstanos por aquí.",
    variables: { "1": "María", "2": "microblading" },
  },
  {
    friendly_name: "confirmacion_cita_link_pago",
    category: "UTILITY",
    language: "es_MX",
    // Copy actualizado 2026-05-02: regla real es anticipo fijo de $500
    // (excepto valoración que tiene su propia template a $300).
    body: "Hello, hello {{1}} 🌿 Para apartar tu cita de {{2}} el {{3}}, necesito un anticipo de ${{4}} MXN. Aquí el link de pago seguro: {{5}}\n\nEn cuanto pagues, queda apartada y te llega confirmación 💜",
    variables: { "1": "María", "2": "microblading", "3": "lunes 5 de mayo", "4": "500", "5": "https://pago.gina/abc123" },
  },
  {
    friendly_name: "confirmacion_cita_valoracion",
    category: "UTILITY",
    language: "es_MX",
    // Para clientas con trabajo previo (microblading antiguo, tatuaje, etc.)
    // Gina siempre ofrece valoración primero ($300 fijo) para definir que
    // procedimiento aplica antes de agendar.
    body: "Hello, hello {{1}} 🌿 Para apartar tu cita de valoración el {{2}}, necesito un anticipo de $300 MXN. Aquí el link de pago seguro: {{3}}\n\nEn la valoración revisamos tus cejitas y definimos juntas el mejor procedimiento para ti 💜",
    variables: { "1": "María", "2": "lunes 5 de mayo a las 11:00", "3": "https://pago.gina/abc123" },
  },
  {
    friendly_name: "aviso_retoque_60d",
    category: "MARKETING",
    language: "es_MX",
    body: "Hello, hello {{1}} 🌿 Pasaron casi 60 días desde tu microblading. Es momento del retoque para que tus cejitas duren más y queden hermosas. ¿Te aparto cita esta semana?",
    variables: { "1": "María" },
  },
  {
    friendly_name: "aviso_retoque_anual",
    category: "MARKETING",
    language: "es_MX",
    body: "Hello, hello {{1}} 🌿 Ya cumplió un año tu microblading. Es momento del retoque anual para mantener tus cejitas en su mejor versión. Si lo agendas este mes, mantienes el precio especial. ¿Te aparto?",
    variables: { "1": "María" },
  },
  {
    friendly_name: "cumpleanos_cupon",
    category: "MARKETING",
    language: "es_MX",
    body: "Hello, hello {{1}} 🎂 ¡Feliz cumpleaños! De parte de Gina Brows te regalamos un diseño de ceja gratis para estrenar el día. Válido los próximos 30 días. ✨",
    variables: { "1": "María" },
  },
  {
    friendly_name: "reactivacion_dormida",
    category: "MARKETING",
    language: "es_MX",
    body: "Hello, hello {{1}} 🌿 Te extrañamos por aquí en Gina Brows. Quería invitarte con un detallito: tu próxima cita la pasas con diseño de ceja gratis 💜 ¿Cuándo te apartamos espacio?",
    variables: { "1": "María" },
  },
  {
    friendly_name: "pedir_resena_google",
    category: "UTILITY",
    language: "es_MX",
    body: "Hello, hello {{1}} 🌿 ¿Te gustaron tus cejitas? Si te animas a dejarme una reseña en Google, me ayudas muchísimo: {{2}} 💜",
    variables: { "1": "María", "2": "https://g.page/r/abc/review" },
  },
  {
    friendly_name: "presentacion_gina_brows",
    category: "MARKETING",
    language: "es_MX",
    // Primer mensaje a cartera fria/dormida que NO tiene a Gina en
    // contactos. Mientras Meta no aprobe Verified Business (✓ verde),
    // WhatsApp muestra el numero crudo en la lista de chats. Esta
    // template establece identidad desde la primera linea para mejorar
    // tasa de apertura/respuesta.
    body: "Hello, hello {{1}} 🌿 Soy Gina, de Gina Brows Microblading Artist 💜 Te escribo desde mi nuevo WhatsApp Business para platicarte de algo especial.\n\nSi quieres ver mi trabajo más reciente, soy @ginat.brows en Instagram: https://www.instagram.com/ginat.brows",
    variables: { "1": "María" },
  },
];

// =========================================================================
// Funciones helpers
// =========================================================================

async function listExisting() {
  const url = "https://content.twilio.com/v1/Content?PageSize=200";
  const res = await fetch(url, { headers: baseHeaders });
  if (!res.ok) {
    throw new Error(`List existing: HTTP ${res.status} ${await res.text()}`);
  }
  const j = await res.json();
  const map = new Map();
  for (const c of j.contents ?? []) {
    map.set(c.friendly_name, c.sid);
  }
  return map;
}

async function createContent(t) {
  const body = {
    friendly_name: t.friendly_name,
    language: t.language,
    types: { "twilio/text": { body: t.body } },
  };
  if (t.variables) body.variables = t.variables;
  const res = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: { ...baseHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Create ${t.friendly_name}: HTTP ${res.status} ${text}`);
  return JSON.parse(text);
}

async function submitForApproval(contentSid, t) {
  const res = await fetch(
    `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      headers: { ...baseHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t.friendly_name,
        category: t.category,
      }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Approve ${t.friendly_name}: HTTP ${res.status} ${text}`);
  return JSON.parse(text);
}

// =========================================================================
// Main
// =========================================================================

async function main() {
  console.log(`\n🔄 Twilio Content Templates (${DRY_RUN ? "DRY RUN" : "LIVE"})`);
  console.log(`   Account: ${SID.slice(0, 10)}...`);
  console.log(`   Templates a procesar: ${TEMPLATES.length}\n`);

  const existing = await listExisting();
  console.log(`📋 ${existing.size} templates existentes en la cuenta\n`);

  const results = [];

  for (const t of TEMPLATES) {
    const tag = `[${t.category.padEnd(9)}]`;
    if (existing.has(t.friendly_name)) {
      console.log(`⏭️  ${tag} ${t.friendly_name} → ya existe (${existing.get(t.friendly_name)}), skip`);
      results.push({ name: t.friendly_name, sid: existing.get(t.friendly_name), status: "existed" });
      continue;
    }

    if (DRY_RUN) {
      console.log(`🔍 ${tag} ${t.friendly_name} → CREARÍA (dry-run)`);
      console.log(`     Body: ${t.body.slice(0, 80)}${t.body.length > 80 ? "..." : ""}`);
      continue;
    }

    try {
      const c = await createContent(t);
      console.log(`✅ ${tag} ${t.friendly_name} → creada (${c.sid})`);
      const a = await submitForApproval(c.sid, t);
      console.log(`   ↳ submitted to Meta · status: ${a.status ?? "pending"}`);
      results.push({ name: t.friendly_name, sid: c.sid, status: "submitted" });
    } catch (e) {
      console.error(`❌ ${tag} ${t.friendly_name} → ${e.message}`);
      results.push({ name: t.friendly_name, error: e.message });
    }
  }

  if (!DRY_RUN) {
    console.log(`\n📌 Mapping para .env.local o constants:\n`);
    for (const r of results) {
      if (r.sid) {
        const constName = `TWILIO_TEMPLATE_${r.name.toUpperCase()}`;
        console.log(`${constName}=${r.sid}`);
      }
    }
    console.log(`\n⏳ La aprobación de Meta tarda 24-48 horas.`);
    console.log(`   Verifica el status en: https://console.twilio.com/us1/develop/content/templates`);
  }
}

main().catch((e) => {
  console.error("\n💥 Error fatal:", e.message);
  process.exit(1);
});
