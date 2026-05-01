#!/usr/bin/env node
/**
 * Borra las templates de Twilio Content que esten en estado rejected.
 * Uso:  node scripts/twilio-templates-delete-rejected.mjs
 *       node scripts/twilio-templates-delete-rejected.mjs --dry-run
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
const auth = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");
const DRY = process.argv.includes("--dry-run");

console.log(`\n🗑️  Borrando templates rejected (${DRY ? "DRY RUN" : "LIVE"})\n`);

const listRes = await fetch("https://content.twilio.com/v1/Content?PageSize=200", {
  headers: { Authorization: auth },
});
const { contents = [] } = await listRes.json();

let borradas = 0;
for (const c of contents) {
  const aRes = await fetch(`https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`, {
    headers: { Authorization: auth },
  });
  if (!aRes.ok) continue;
  const aj = await aRes.json();
  const wa = aj.whatsapp ?? aj.approval_requests?.find((x) => x.channel === "whatsapp");
  if (wa?.status !== "rejected") continue;

  if (DRY) {
    console.log(`🔍 borraría ${c.friendly_name} (${c.sid})`);
    borradas++;
    continue;
  }
  const delRes = await fetch(`https://content.twilio.com/v1/Content/${c.sid}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });
  if (delRes.ok || delRes.status === 204) {
    console.log(`✅ borrada ${c.friendly_name} (${c.sid})`);
    borradas++;
  } else {
    const t = await delRes.text();
    console.error(`❌ ${c.friendly_name}: HTTP ${delRes.status} ${t.slice(0, 120)}`);
  }
}

console.log(`\nTotal: ${borradas} ${DRY ? "borraría(n)" : "borrada(s)"}\n`);
