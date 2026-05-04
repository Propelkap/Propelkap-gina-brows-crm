import { readFileSync } from "node:fs";
import twilio from "twilio";
const env = {};
for (const line of readFileSync("/Users/borrebriones/gina-brows-crm/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

console.log("Test 1: SDK con contentVariables como STRING JSON (igual a lib/whatsapp.ts):");
try {
  const msg = await client.messages.create({
    from: env.TWILIO_WHATSAPP_FROM,
    to: "whatsapp:+5218131175672",
    contentSid: env.TWILIO_TEMPLATE_AVISO_RETOQUE_ANUAL,
    contentVariables: JSON.stringify({"1": "Test1"}),
  });
  console.log(`  ✅ ${msg.sid}`);
} catch (e) { console.log(`  ❌ ${e.code}: ${e.message}`); }

console.log("\nTest 2: SDK con contentVariables como OBJETO:");
try {
  const msg = await client.messages.create({
    from: env.TWILIO_WHATSAPP_FROM,
    to: "whatsapp:+5218131175672",
    contentSid: env.TWILIO_TEMPLATE_AVISO_RETOQUE_ANUAL,
    contentVariables: {"1": "Test2"},
  });
  console.log(`  ✅ ${msg.sid}`);
} catch (e) { console.log(`  ❌ ${e.code}: ${e.message}`); }
