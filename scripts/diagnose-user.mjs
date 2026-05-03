#!/usr/bin/env node
/**
 * Diagnostica problemas de login de un usuario Supabase.
 * Reporta estado en auth.users + public.usuarios + intenta login con
 * password dada para confirmar que funciona end-to-end.
 *
 * Uso:
 *   node scripts/diagnose-user.mjs <email> [<password>]
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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const [, , email, password] = process.argv;
if (!email) {
  console.error("Uso: node scripts/diagnose-user.mjs <email> [<password>]");
  process.exit(1);
}

const adminHeaders = {
  apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json",
};

console.log(`\n🔍 Diagnóstico para: ${email}\n`);

// 1. auth.users via admin API
console.log("=== auth.users ===");
const r1 = await fetch(`${URL_}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: adminHeaders });
const j1 = await r1.json();
const u = (j1.users ?? []).find((x) => x.email === email);
if (!u) {
  console.error(`❌ No existe en auth.users`);
  process.exit(1);
}
console.log(`id:                ${u.id}`);
console.log(`email_confirmed_at:${u.email_confirmed_at ?? "❌ NO CONFIRMADO"}`);
console.log(`phone_confirmed_at:${u.phone_confirmed_at ?? "—"}`);
console.log(`banned_until:      ${u.banned_until ?? "—"}`);
console.log(`last_sign_in_at:   ${u.last_sign_in_at ?? "nunca"}`);
console.log(`created_at:        ${u.created_at}`);
console.log(`updated_at:        ${u.updated_at}`);
console.log(`role:              ${u.role}`);
console.log(`confirmation_sent_at:${u.confirmation_sent_at ?? "—"}`);
console.log(`recovery_sent_at:  ${u.recovery_sent_at ?? "—"}`);
console.log(`is_anonymous:      ${u.is_anonymous}`);

// 2. public.usuarios row
console.log("\n=== public.usuarios ===");
const r2 = await fetch(`${URL_}/rest/v1/usuarios?id=eq.${u.id}&select=*`, { headers: adminHeaders });
const j2 = await r2.json();
if (Array.isArray(j2) && j2.length > 0) {
  console.log(`✓ Row existe`);
  console.log(JSON.stringify(j2[0], null, 2));
} else {
  console.log(`❌ NO existe row en public.usuarios para auth_user_id=${u.id}`);
  console.log(`   Esto puede causar redirect después del login si el middleware lo requiere.`);
}

// 3. Test de login real con anon key + password
if (password) {
  console.log("\n=== Test login con password ===");
  const r3 = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j3 = await r3.json();
  if (r3.ok && j3.access_token) {
    console.log(`✅ Login exitoso. access_token recibido.`);
    console.log(`   user.email: ${j3.user?.email}`);
    console.log(`   expires_in: ${j3.expires_in}s`);
  } else {
    console.error(`❌ Login falló: ${j3.error_description ?? j3.msg ?? JSON.stringify(j3)}`);
    console.error(`   error_code: ${j3.error ?? j3.code}`);
  }
}

console.log("");
