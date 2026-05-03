#!/usr/bin/env node
/**
 * Migra datos de proyecto Supabase ORIGEN → DESTINO via REST API.
 * Asume que el schema ya está aplicado en DESTINO (correr
 * supabase/migrations/CONSOLIDATED-MIGRATION.sql primero).
 *
 * Tablas migradas en orden de FK (de menos a más dependiente):
 *   1. usuarios
 *   2. servicios
 *   3. clientes
 *   4. citas
 *   5. cita_items
 *   6. procedimientos
 *   7. fotos
 *   8. consentimientos
 *   9. consentimiento_templates
 *   10. pagos
 *   11. comunicaciones
 *   12. campanias
 *   13. referidos
 *   14. resenas_solicitudes
 *   15. configuracion
 *   16. email_templates
 *   17. bot_pausado
 *   18. bot_feedback
 *   19. calendar_tokens
 *   20. push_subscriptions
 *   21. intake_submissions
 *
 * Uso:
 *   ORIGEN_URL=... ORIGEN_KEY=... DEST_URL=... DEST_KEY=... node migrate-data.mjs
 *   o más simple — toma de .env:
 *   node migrate-data.mjs
 */
import { readFileSync } from "node:fs";

// === Config ===
const ORIGEN_URL = "https://bkubkqjofimdekmjjhpw.supabase.co";
const ORIGEN_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrdWJrcWpvZmltZGVrbWpqaHB3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMwMDk2MCwiZXhwIjoyMDkyODc2OTYwfQ.FKtmTIhDbwJ4FIhTxCs5hBJeJ-m5HAlGIYKpm-HAP50";

// Destino: leer de .env.local
function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnv(new URL("../.env.local", import.meta.url).pathname);
const DEST_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const DEST_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!DEST_URL || !DEST_KEY) {
  console.error("❌ Faltan envs DEST. Verifica .env.local");
  process.exit(1);
}

console.log(`\n🔄 Migración de datos`);
console.log(`   Origen:  ${ORIGEN_URL}`);
console.log(`   Destino: ${DEST_URL}\n`);

// === Orden de tablas (respeta FKs) ===
const TABLES_ORDER = [
  "usuarios",
  "servicios",
  "clientes",
  "citas",
  "cita_items",
  "procedimientos",
  "fotos",
  "consentimiento_templates",
  "consentimientos",
  "pagos",
  "comunicaciones",
  "campanias",
  "referidos",
  "resenas_solicitudes",
  "configuracion",
  "email_templates",
  "bot_pausado",
  "bot_feedback",
  "calendar_tokens",
  "push_subscriptions",
  "intake_submissions",
];

function originHeaders() {
  return {
    apikey: ORIGEN_KEY,
    Authorization: `Bearer ${ORIGEN_KEY}`,
    "Content-Type": "application/json",
  };
}
function destHeaders() {
  return {
    apikey: DEST_KEY,
    Authorization: `Bearer ${DEST_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function tableExists(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok;
}

async function fetchAll(table) {
  const all = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const res = await fetch(
      `${ORIGEN_URL}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`,
      { headers: originHeaders() }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fetch ${table} (offset ${offset}): HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function insertBatch(table, rows) {
  if (rows.length === 0) return { inserted: 0, errors: [] };
  const BATCH = 100;
  let inserted = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${DEST_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: destHeaders(),
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      errors.push(`batch ${i}-${i + batch.length}: HTTP ${res.status} ${text.slice(0, 300)}`);
      continue;
    }
    inserted += batch.length;
  }
  return { inserted, errors };
}

// === Main ===
const summary = [];
for (const table of TABLES_ORDER) {
  process.stdout.write(`  ${table.padEnd(28)} `);

  // Skip si no existe en alguna
  const [okOrigin, okDest] = await Promise.all([
    tableExists(ORIGEN_URL, ORIGEN_KEY, table),
    tableExists(DEST_URL, DEST_KEY, table),
  ]);
  if (!okOrigin) {
    console.log(`⏭  no existe en origen`);
    summary.push({ table, status: "skipped (no en origen)" });
    continue;
  }
  if (!okDest) {
    console.log(`❌ no existe en destino — corre CONSOLIDATED-MIGRATION.sql primero`);
    summary.push({ table, status: "DEST FALTA" });
    continue;
  }

  try {
    const rows = await fetchAll(table);
    if (rows.length === 0) {
      console.log(`(0 rows)`);
      summary.push({ table, source: 0, inserted: 0 });
      continue;
    }
    process.stdout.write(`${rows.length} rows → `);
    const { inserted, errors } = await insertBatch(table, rows);
    if (errors.length === 0) {
      console.log(`✅ ${inserted} migrados`);
    } else {
      console.log(`⚠️  ${inserted}/${rows.length} migrados, ${errors.length} batches con error`);
      errors.slice(0, 2).forEach((e) => console.log(`     ${e}`));
    }
    summary.push({ table, source: rows.length, inserted, errors: errors.length });
  } catch (e) {
    console.log(`❌ ${e.message}`);
    summary.push({ table, status: `ERROR: ${e.message}` });
  }
}

console.log(`\n📊 Resumen:`);
console.table(summary);
console.log(`\n✨ Migración completa. Valida en el dashboard de ffibztcfr.\n`);
