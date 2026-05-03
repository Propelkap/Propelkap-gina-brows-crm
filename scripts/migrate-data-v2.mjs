#!/usr/bin/env node
/**
 * v2 — Migra datos bkubkqjofim → ffibztcfr resolviendo:
 *   1. Crea auth user de Gina con UUID forzado (FK target).
 *   2. DELETE las tablas con seed (que CONSOLIDATED-MIGRATION ya pobló)
 *      antes de insertar los datos reales.
 *   3. Excluye columnas generated (whatsapp_normalizado).
 *   4. Usa onConflict=id para UPSERT donde aplica.
 *   5. Inserta en orden estricto de FKs.
 */
import { readFileSync } from "node:fs";

const ORIGEN_URL = "https://bkubkqjofimdekmjjhpw.supabase.co";
const ORIGEN_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrdWJrcWpvZmltZGVrbWpqaHB3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMwMDk2MCwiZXhwIjoyMDkyODc2OTYwfQ.FKtmTIhDbwJ4FIhTxCs5hBJeJ-m5HAlGIYKpm-HAP50";

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

console.log(`\n🔄 Migración v2`);
console.log(`   Origen:  ${ORIGEN_URL}`);
console.log(`   Destino: ${DEST_URL}\n`);

// === 0. Crear auth user de Gina con UUID forzado ===
const GINA_UUID = "b6cdf1b5-267d-498b-aa1b-4a5400891191";
const GINA_EMAIL = "torresginaq@gmail.com";
const GINA_PASSWORD = "cejitas12";

console.log("→ Creando auth user de Gina con UUID forzado...");
const adminH = { apikey: DEST_KEY, Authorization: `Bearer ${DEST_KEY}`, "Content-Type": "application/json" };
const userRes = await fetch(`${DEST_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: adminH,
  body: JSON.stringify({
    id: GINA_UUID,
    email: GINA_EMAIL,
    password: GINA_PASSWORD,
    email_confirm: true,
    user_metadata: { nombre: "Gina Torres" },
  }),
});
if (userRes.ok) {
  console.log(`   ✅ Auth user creado: ${GINA_EMAIL} (id=${GINA_UUID})`);
} else {
  const t = await userRes.text();
  if (t.includes("already") || userRes.status === 422) {
    console.log(`   ⏭ Auth user ya existía, continuando`);
  } else {
    console.error(`   ❌ HTTP ${userRes.status}: ${t}`);
    process.exit(1);
  }
}

// === 1. DELETE seeds existentes de tablas que CONSOLIDATED-MIGRATION pobló ===
const SEEDED_TABLES = [
  "bot_feedback",      // FK a comunicaciones, lo borro primero
  "calendar_tokens",
  "push_subscriptions",
  "intake_submissions",
  "consentimientos",   // FK a clientes
  "fotos",             // FK a clientes
  "procedimientos",    // FK a citas
  "comunicaciones",    // FK a clientes
  "cita_items",        // FK a citas
  "pagos",             // FK a citas
  "campanias",
  "referidos",
  "resenas_solicitudes",
  "citas",             // FK a clientes
  "clientes",
  "consentimiento_templates",
  "email_templates",
  "configuracion",
  "servicios",
  "usuarios",
];

console.log("\n→ Limpiando datos existentes en destino (orden inverso de FKs)...");
for (const t of SEEDED_TABLES) {
  const res = await fetch(`${DEST_URL}/rest/v1/${t}?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: "DELETE",
    headers: { ...adminH, Prefer: "return=minimal" },
  });
  // Algunas tablas no tienen UUID id (como configuracion con id=1)
  if (!res.ok && res.status === 406) {
    // Try with int id
    await fetch(`${DEST_URL}/rest/v1/${t}?id=neq.0`, {
      method: "DELETE",
      headers: { ...adminH, Prefer: "return=minimal" },
    });
  }
  process.stdout.write(`  ${t} ${res.status === 204 || res.status === 200 ? "✓" : "(" + res.status + ")"}  `);
}
console.log("\n");

// === 2. Migrar tabla por tabla con fixes ===

const ORIGIN_HEADERS = { apikey: ORIGEN_KEY, Authorization: `Bearer ${ORIGEN_KEY}` };
const DEST_HEADERS = { apikey: DEST_KEY, Authorization: `Bearer ${DEST_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };

// Columnas generated por tabla — se excluyen en el INSERT
const GENERATED_COLS = {
  clientes: ["whatsapp_normalizado"],
};

async function fetchAll(table) {
  const all = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const res = await fetch(`${ORIGEN_URL}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`, { headers: ORIGIN_HEADERS });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 404) return null; // tabla no existe
      throw new Error(`fetch ${table}: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function stripGenerated(rows, table) {
  const cols = GENERATED_COLS[table];
  if (!cols) return rows;
  return rows.map((r) => {
    const copy = { ...r };
    for (const c of cols) delete copy[c];
    return copy;
  });
}

async function insertBatch(table, rows) {
  const BATCH = 100;
  let inserted = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${DEST_URL}/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: { ...DEST_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      errors.push(`batch ${i}-${i + batch.length}: HTTP ${res.status} ${text.slice(0, 250)}`);
      continue;
    }
    inserted += batch.length;
  }
  return { inserted, errors };
}

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
  "bot_feedback",
  "calendar_tokens",
  "push_subscriptions",
];

const summary = [];
for (const table of TABLES_ORDER) {
  process.stdout.write(`  ${table.padEnd(28)} `);
  let rows;
  try {
    rows = await fetchAll(table);
  } catch (e) {
    console.log(`❌ ${e.message}`);
    summary.push({ table, status: `ERROR: ${e.message}` });
    continue;
  }
  if (rows === null) {
    console.log(`⏭ no existe en origen`);
    summary.push({ table, status: "skipped" });
    continue;
  }
  if (rows.length === 0) {
    console.log(`(0 rows)`);
    summary.push({ table, source: 0, inserted: 0 });
    continue;
  }
  process.stdout.write(`${rows.length} rows → `);
  const cleanRows = stripGenerated(rows, table);
  const { inserted, errors } = await insertBatch(table, cleanRows);
  if (errors.length === 0) {
    console.log(`✅ ${inserted}`);
  } else {
    console.log(`⚠️ ${inserted}/${rows.length}, ${errors.length} batches err`);
    errors.slice(0, 1).forEach((e) => console.log(`     ${e}`));
  }
  summary.push({ table, source: rows.length, inserted, errors: errors.length });
}

console.log(`\n📊 Resumen final:`);
console.table(summary);
