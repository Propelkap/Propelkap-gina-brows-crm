#!/usr/bin/env node
/**
 * Manda 1 mensaje template via Twilio API directo desde shell.
 * Usa creds de .env.local. Reporta el response completo de Twilio para
 * diagnosticar errores como ChannelEndpoint not supported, recipient not
 * opted in, etc.
 *
 * Uso:
 *   node scripts/twilio-send-test.mjs <numero> <template_name> [<var1>]
 *
 * Ejemplo:
 *   node scripts/twilio-send-test.mjs +5218131175672 aviso_retoque_60d Jorge
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env.local");

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const SID = env.TWILIO_ACCOUNT_SID;
const TOKEN = env.TWILIO_AUTH_TOKEN;
const FROM = env.TWILIO_WHATSAPP_FROM;

const TEMPLATE_SID_ENV = {
  reactivacion_dormida: "TWILIO_TEMPLATE_REACTIVACION_DORMIDA",
  aviso_retoque_60d: "TWILIO_TEMPLATE_AVISO_RETOQUE_60D",
  aviso_retoque_anual: "TWILIO_TEMPLATE_AVISO_RETOQUE_ANUAL",
  cumpleanos_cupon: "TWILIO_TEMPLATE_CUMPLEANOS_CUPON",
  recordatorio_cita_24h: "TWILIO_TEMPLATE_RECORDATORIO_CITA_24H",
  recordatorio_cita_2h: "TWILIO_TEMPLATE_RECORDATORIO_CITA_2H",
  confirmacion_cita_link_pago: "TWILIO_TEMPLATE_CONFIRMACION_CITA_LINK_PAGO",
  confirmacion_cita_valoracion: "TWILIO_TEMPLATE_CONFIRMACION_CITA_VALORACION",
  pedir_resena_google: "TWILIO_TEMPLATE_PEDIR_RESENA_GOOGLE",
};

const [, , numero, template, var1 = "Jorge"] = process.argv;
if (!numero || !template) {
  console.error("Uso: node scripts/twilio-send-test.mjs <numero> <template_name> [<var1>]");
  console.error("\nTemplates disponibles:");
  for (const k of Object.keys(TEMPLATE_SID_ENV)) console.error(`  - ${k}`);
  process.exit(1);
}

const templateSid = env[TEMPLATE_SID_ENV[template]];
if (!templateSid) {
  console.error(`❌ Template '${template}' no encontrada en envs`);
  process.exit(1);
}

const to = `whatsapp:${numero.startsWith("+") ? numero : "+" + numero}`;
const fromAddr = FROM.startsWith("whatsapp:") ? FROM : `whatsapp:${FROM}`;
const auth = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");

const variables = JSON.stringify({
  "1": var1,
  "2": "lunes 5 de mayo a las 11:00",
  "3": "microblading",
  "4": "500",
  "5": "https://gina-brows.vercel.app",
});

console.log(`\n📤 Enviando test:`);
console.log(`   From: ${fromAddr}`);
console.log(`   To:   ${to}`);
console.log(`   Template: ${template} (${templateSid})`);
console.log(`   Vars: ${variables}\n`);

const params = new URLSearchParams();
params.append("To", to);
params.append("From", fromAddr);
params.append("ContentSid", templateSid);
params.append("ContentVariables", variables);

const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
  method: "POST",
  headers: {
    Authorization: auth,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: params.toString(),
});

const body = await res.text();
console.log(`HTTP ${res.status}\n`);
try {
  const j = JSON.parse(body);
  console.log(JSON.stringify(j, null, 2));
  if (j.sid) {
    console.log(`\n✅ Mensaje aceptado por Twilio: ${j.sid}`);
    console.log(`   Status inicial: ${j.status}`);
    console.log(`   Status URI: https://www.twilio.com/console/sms/logs/${j.sid}`);
    console.log(`\n   Espera 5-15 segundos y verifica que llegue al celular.`);
    console.log(`   Si NO llega: hay error en delivery (sin opt-in WhatsApp del recipient, sender bloqueado, número raro, etc.)`);
    console.log(`\n   Para checar delivery status despues:`);
    console.log(`   curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \\`);
    console.log(`     "https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages/${j.sid}.json" \\`);
    console.log(`     | python3 -m json.tool | grep -E "status|error_code|error_message"`);
  }
} catch {
  console.log(body);
}
