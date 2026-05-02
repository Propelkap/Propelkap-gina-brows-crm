#!/usr/bin/env node
/**
 * Borra una template de Twilio Content por friendly_name (sin importar
 * su approval status) y permite re-crearla despues con
 * upload-twilio-templates.mjs.
 *
 * Uso:
 *   node scripts/twilio-template-replace.mjs <friendly_name>
 *   node scripts/twilio-template-replace.mjs confirmacion_cita_link_pago --dry-run
 *
 * Flujo recomendado para "actualizar" una template:
 *   1. Edita el body en upload-twilio-templates.mjs
 *   2. node scripts/twilio-template-replace.mjs <name>  (borra la vieja)
 *   3. node scripts/upload-twilio-templates.mjs        (crea la nueva)
 *   4. Espera aprobacion Meta (24-48h)
 *   5. Actualiza el TWILIO_TEMPLATE_<NAME> SID en .env.local + Vercel envs
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

const target = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
const DRY = process.argv.includes("--dry-run");
if (!target) {
  console.error("Uso: node scripts/twilio-template-replace.mjs <friendly_name> [--dry-run]");
  process.exit(1);
}

const env = loadEnv(ENV_PATH);
const auth = "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

console.log(`\n🗑️  Buscando templates con friendly_name='${target}' (${DRY ? "DRY RUN" : "LIVE"})\n`);

const listRes = await fetch("https://content.twilio.com/v1/Content?PageSize=200", {
  headers: { Authorization: auth },
});
const { contents = [] } = await listRes.json();
const matching = contents.filter((c) => c.friendly_name === target);

if (matching.length === 0) {
  console.log("(no hay templates con ese nombre)");
  process.exit(0);
}

for (const c of matching) {
  // Mostrar approval status si lo tiene
  const aRes = await fetch(`https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`, {
    headers: { Authorization: auth },
  });
  let status = "?";
  if (aRes.ok) {
    const aj = await aRes.json();
    const wa = aj.whatsapp ?? aj.approval_requests?.find((x) => x.channel === "whatsapp");
    status = wa?.status ?? "sin approval";
  }
  console.log(`Encontrada: ${c.sid} · status=${status}`);
  if (DRY) {
    console.log(`  → borraría (dry-run)`);
    continue;
  }
  const delRes = await fetch(`https://content.twilio.com/v1/Content/${c.sid}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });
  if (delRes.ok || delRes.status === 204) {
    console.log(`  ✅ borrada`);
  } else {
    const t = await delRes.text();
    console.error(`  ❌ HTTP ${delRes.status}: ${t.slice(0, 200)}`);
  }
}

if (!DRY) {
  console.log(`\nSiguiente paso:\n  node scripts/upload-twilio-templates.mjs\n`);
}
