#!/usr/bin/env node
/**
 * Lista las templates de WhatsApp del subaccount con su approval_status
 * de Meta. Util para saber cuales ya estan aprobadas y se pueden disparar
 * desde los crons sin error.
 *
 * Uso:  node scripts/twilio-templates-status.mjs
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

const STATUS_EMOJI = {
  approved: "🟢",
  pending: "🟡",
  received: "🟡",
  rejected: "🔴",
  paused: "⚫",
  unsubmitted: "⚪",
};

console.log("\n📋 Twilio Templates · Approval status\n");

// 1. Lista todas las templates
const listRes = await fetch("https://content.twilio.com/v1/Content?PageSize=200", {
  headers: { Authorization: auth },
});
if (!listRes.ok) {
  console.error(`❌ Error: HTTP ${listRes.status}`);
  process.exit(1);
}
const { contents = [] } = await listRes.json();

if (!contents.length) {
  console.log("(sin templates en la cuenta)");
  process.exit(0);
}

// 2. Para cada template, obtener su approval status
for (const c of contents) {
  const aRes = await fetch(
    `https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`,
    { headers: { Authorization: auth } }
  );
  let approvalLabel = "(sin approval request)";
  if (aRes.ok) {
    const aj = await aRes.json();
    const wa = aj.whatsapp ?? aj.approval_requests?.find((x) => x.channel === "whatsapp");
    if (wa) {
      const status = wa.status ?? "unknown";
      const cat = wa.category ?? "—";
      const reason = wa.rejection_reason ? ` · ${wa.rejection_reason}` : "";
      approvalLabel = `${STATUS_EMOJI[status] ?? "❓"} ${status} · ${cat}${reason}`;
    }
  }
  console.log(`${c.friendly_name.padEnd(35)} ${approvalLabel}`);
  console.log(`  ${c.sid}`);
}

console.log(`\nTotal: ${contents.length} templates`);
console.log("Verifica detalle en: https://console.twilio.com/us1/develop/content/templates\n");
