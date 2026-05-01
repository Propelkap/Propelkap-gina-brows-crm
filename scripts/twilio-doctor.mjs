#!/usr/bin/env node
/**
 * Diagnostico rapido de credenciales Twilio: lee .env.local, prueba auth
 * contra la API base, y lista los WhatsApp senders + templates si pasa.
 *
 * Uso:  node scripts/twilio-doctor.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env.local");

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

console.log("\n🔍 Twilio Doctor\n");
console.log("📋 .env.local:");
console.log(`   TWILIO_ACCOUNT_SID = ${SID || "(no encontrado)"}`);
console.log(`   TWILIO_AUTH_TOKEN  = ${TOKEN ? TOKEN.slice(0, 6) + "..." + TOKEN.slice(-4) + ` (${TOKEN.length} chars)` : "(no encontrado)"}`);
console.log(`   TWILIO_WHATSAPP_FROM = ${env.TWILIO_WHATSAPP_FROM || "(no encontrado)"}`);

if (!SID || !TOKEN) {
  console.error("\n❌ Faltan credenciales. Aborto.\n");
  process.exit(1);
}

if (TOKEN.length !== 32) {
  console.warn(`\n⚠️  TWILIO_AUTH_TOKEN tiene ${TOKEN.length} chars (esperaba 32). Revisa que no tenga espacios o quotes extras.`);
}

const auth = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");
const headers = { Authorization: auth };

// === Test 1: cuenta base ===
console.log("\n🧪 Test 1: GET /Accounts/{SID}");
{
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}.json`, { headers });
  const text = await res.text();
  if (!res.ok) {
    console.error(`   ❌ HTTP ${res.status}`);
    try {
      const j = JSON.parse(text);
      console.error(`   ${j.message ?? "(sin mensaje)"}`);
      console.error(`   more_info: ${j.more_info ?? "(no provided)"}`);
    } catch {
      console.error(`   raw: ${text.slice(0, 200)}`);
    }
    console.error("\n💡 Las credenciales NO son válidas para esta cuenta.");
    console.error("   Acciones: ");
    console.error("   - Ve a Twilio Console → arriba a la izquierda elige la cuenta correcta");
    console.error("   - Copia el SID y Auth Token de la home (no el de subaccount si tu API key es de master)");
    console.error("   - Pega en .env.local sin comillas ni espacios");
    process.exit(1);
  }
  const j = JSON.parse(text);
  console.log(`   ✅ OK · cuenta '${j.friendly_name}' · status ${j.status} · type ${j.type}`);
}

// === Test 2: listar WhatsApp senders ===
console.log("\n🧪 Test 2: GET /v2/Channels/Senders (WhatsApp)");
{
  const res = await fetch("https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=50", { headers });
  const text = await res.text();
  if (!res.ok) {
    console.warn(`   ⚠️  HTTP ${res.status} — puede ser que esta cuenta no tenga API messaging habilitada o sea solo subaccount.`);
    console.warn(`   ${text.slice(0, 200)}`);
  } else {
    const j = JSON.parse(text);
    console.log(`   ✅ ${(j.senders ?? []).length} sender(s)`);
    for (const s of j.senders ?? []) {
      const name = s.profile?.name ?? "(sin display name)";
      const status = s.status ?? "?";
      console.log(`      · ${s.sender_id} · status=${status} · profile.name="${name}" · sid=${s.sid}`);
    }
  }
}

// === Test 3: listar Content Templates ===
console.log("\n🧪 Test 3: GET /v1/Content (templates)");
{
  const res = await fetch("https://content.twilio.com/v1/Content?PageSize=200", { headers });
  const text = await res.text();
  if (!res.ok) {
    console.warn(`   ⚠️  HTTP ${res.status}`);
    console.warn(`   ${text.slice(0, 200)}`);
  } else {
    const j = JSON.parse(text);
    const total = (j.contents ?? []).length;
    console.log(`   ✅ ${total} templates en la cuenta`);
    if (total) {
      const friendly = (j.contents ?? []).map((c) => c.friendly_name).slice(0, 10);
      console.log(`      primeras 10: ${friendly.join(", ")}${total > 10 ? "..." : ""}`);
    }
  }
}

console.log("\n✨ Diagnostico completo.\n");
