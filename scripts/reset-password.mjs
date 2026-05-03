#!/usr/bin/env node
/**
 * Cambia el password de un usuario Supabase via Admin API.
 * Usa la service role key del .env.local — bypass RLS y email confirmation.
 *
 * Uso:
 *   node scripts/reset-password.mjs <email> <nueva_password>
 *
 * Ejemplo:
 *   node scripts/reset-password.mjs torresginaq@gmail.com "Gina2026!Brows"
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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const [, , email, newPassword] = process.argv;
if (!email || !newPassword) {
  console.error("Uso: node scripts/reset-password.mjs <email> <nueva_password>");
  console.error("\nEjemplo: node scripts/reset-password.mjs torresginaq@gmail.com 'Gina2026Brows'");
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error("❌ Password debe tener mínimo 6 caracteres");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

console.log(`\n🔐 Reset password para: ${email}`);

// 1. Buscar el user_id por email
console.log("→ Buscando usuario...");
const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
  headers,
});
const listJson = await listRes.json();
const user = (listJson.users ?? []).find((u) => u.email === email);

if (!user) {
  console.error(`❌ No encontré usuario con email ${email}`);
  console.error(`   Total usuarios en proyecto: ${listJson.users?.length ?? 0}`);
  if (listJson.users?.length) {
    console.error(`   Emails disponibles:`);
    listJson.users.forEach((u) => console.error(`   - ${u.email}`));
  }
  process.exit(1);
}

console.log(`✓ Usuario encontrado: ${user.id}`);
console.log(`  Created: ${user.created_at}`);
console.log(`  Last sign in: ${user.last_sign_in_at ?? "nunca"}`);

// 2. Actualizar password
console.log("→ Actualizando password...");
const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({
    password: newPassword,
    email_confirm: true, // marca email como confirmado por si acaso
  }),
});

if (!updateRes.ok) {
  const text = await updateRes.text();
  console.error(`❌ HTTP ${updateRes.status}: ${text}`);
  process.exit(1);
}

const updated = await updateRes.json();
console.log(`\n✅ Password actualizado para ${email}`);
console.log(`   Login en: https://gina-brows-crm.vercel.app/login`);
console.log(`   Email:    ${email}`);
console.log(`   Password: ${newPassword}`);
console.log(`\n   Compártelo con Gina por WhatsApp o llamada.`);
console.log(`   Una vez logueada, puede cambiarlo desde Supabase email recovery.`);
