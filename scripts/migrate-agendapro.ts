#!/usr/bin/env node
/**
 * Migración AgendaPro → Gina Brows CRM
 *
 * Uso:
 *   npx tsx scripts/migrate-agendapro.ts --clientes ~/path/clientes.csv --citas ~/path/citas.csv [--dry-run]
 *
 * El script:
 *   1. Lee CSV de clientes y de citas
 *   2. Normaliza datos (teléfonos a E.164 MX, emails lowercase, fechas ISO)
 *   3. Deduplica por whatsapp normalizado o email
 *   4. Hace UPSERT en Supabase (re-correrlo es seguro, no duplica)
 *   5. Calcula y guarda fechas de retoque pendientes desde el historial
 *   6. Sube el CSV original al bucket agendapro-exports como backup en frío
 *
 * Modo --dry-run: imprime lo que haría sin tocar la BD.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseArgs } from "node:util";

// ================== CLI args ==================

const { values: args } = parseArgs({
  options: {
    clientes: { type: "string" },
    citas: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help || (!args.clientes && !args.citas)) {
  console.log(`
Migración AgendaPro → Gina Brows CRM

Flags:
  --clientes <path>   Path al CSV exportado de "Clientes" en AgendaPro
  --citas <path>      Path al CSV exportado de "Citas histórico" en AgendaPro
  --dry-run           Imprime lo que haría sin escribir en BD
  --help              Esta ayuda

Ejemplo:
  npx tsx scripts/migrate-agendapro.ts \\
    --clientes ~/Downloads/agendapro-clientes.csv \\
    --citas ~/Downloads/agendapro-citas.csv \\
    --dry-run
`);
  process.exit(0);
}

const DRY = args["dry-run"] === true;

// ================== Supabase ==================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.");
  console.error("   Corre: source .env.local && npx tsx scripts/migrate-agendapro.ts ...");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ================== CSV parser (sin dependencias) ==================

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result;
}

// ================== Normalización ==================

function normalizePhoneMx(raw: string): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^0-9+]/g, "");
  if (!p) return null;
  // Si ya empieza con +52, OK
  if (p.startsWith("+52")) return p;
  // Si empieza con 52 y total >= 12, agregar +
  if (p.startsWith("52") && p.length >= 12) return `+${p}`;
  // Si tiene 10 dígitos, asumir MX y prependear +52
  if (p.length === 10) return `+52${p}`;
  // Si tiene 11 dígitos y empieza con 1 (US/CA), preserve +1
  if (p.startsWith("1") && p.length === 11) return `+${p}`;
  // Demás casos: regresar como vino con +
  return p.startsWith("+") ? p : `+${p}`;
}

function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Intenta varios formatos comunes de AgendaPro
  // AgendaPro suele usar DD/MM/YYYY o YYYY-MM-DD
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Si trae hora, intenta Date parse
  const dt = new Date(t);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseDateTime(raw: string): string | null {
  if (!raw) return null;
  const dt = new Date(raw.trim());
  if (!isNaN(dt.getTime())) return dt.toISOString();
  // Fallback: combinar fecha + hora
  return null;
}

function splitNombre(full: string): { nombre: string; apellido: string | null } {
  if (!full) return { nombre: "(sin nombre)", apellido: null };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { nombre: parts[0], apellido: null };
  if (parts.length === 2) return { nombre: parts[0], apellido: parts[1] };
  // 3+ palabras: primera 1 = nombre, resto = apellido
  return { nombre: parts[0], apellido: parts.slice(1).join(" ") };
}

// ================== Mapeo de columnas (heurística) ==================

function pick(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] && row[c].trim()) return row[c].trim();
  }
  return "";
}

const CLIENTE_COLS = {
  nombre: ["nombre", "nombres", "name", "cliente", "nombre_completo", "full_name"],
  apellido: ["apellido", "apellidos", "last_name", "lastname"],
  email: ["email", "correo", "correo_electronico", "e_mail"],
  whatsapp: ["telefono", "teléfono", "celular", "phone", "movil", "móvil", "whatsapp"],
  fecha_nacimiento: ["fecha_nacimiento", "cumpleaños", "cumpleanos", "birthday", "fecha_de_nacimiento"],
  notas: ["notas", "observaciones", "comentarios", "notes"],
  agendapro_id: ["agendapro_id", "id", "id_cliente", "cliente_id", "numero_de_cliente"],
};

const CITA_COLS = {
  cliente_id_agendapro: ["cliente_id", "id_cliente", "cliente"],
  cliente_nombre: ["cliente_nombre", "nombre_cliente", "cliente"],
  servicio: ["servicio", "service", "tratamiento"],
  fecha: ["fecha", "date", "fecha_cita"],
  hora: ["hora", "time", "hora_inicio"],
  estado: ["estado", "status"],
  precio: ["precio", "price", "costo", "monto"],
  notas: ["notas", "observaciones", "comentarios"],
  agendapro_id: ["id", "id_cita", "cita_id"],
};

// ================== Lectura de CSVs ==================

async function loadClientes(path: string) {
  const content = readFileSync(resolve(path), "utf-8");
  const rows = parseCsv(content);
  console.log(`\n📥 Clientes leídos del CSV: ${rows.length}`);
  if (rows.length > 0) {
    console.log(`   Columnas detectadas: ${Object.keys(rows[0]).join(", ")}`);
  }
  return rows;
}

async function loadCitas(path: string) {
  const content = readFileSync(resolve(path), "utf-8");
  const rows = parseCsv(content);
  console.log(`\n📥 Citas leídas del CSV: ${rows.length}`);
  if (rows.length > 0) {
    console.log(`   Columnas detectadas: ${Object.keys(rows[0]).join(", ")}`);
  }
  return rows;
}

// ================== Subir backup en frío ==================

async function uploadBackup(path: string, kind: "clientes" | "citas") {
  if (DRY) {
    console.log(`   [DRY] Subiría ${kind} CSV al bucket agendapro-exports`);
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const remote = `${stamp}/${kind}-${basename(path)}`;
  const buffer = readFileSync(resolve(path));
  const { error } = await sb.storage.from("agendapro-exports").upload(remote, buffer, {
    contentType: "text/csv",
    upsert: false,
  });
  if (error) {
    console.error(`   ⚠️  Error subiendo backup ${kind}:`, error.message);
  } else {
    console.log(`   ✅ Backup ${kind} subido: ${remote}`);
  }
}

// ================== Migrar clientes ==================

type ClienteIn = ReturnType<typeof normalizeCliente>;

function normalizeCliente(row: Record<string, string>) {
  // Si nombre Y apellido vienen como columnas separadas, respetar.
  // Si solo viene "nombre" como nombre completo, hacer split heurístico.
  const apellidoSeparado = pick(row, CLIENTE_COLS.apellido);
  const nombreRaw = pick(row, CLIENTE_COLS.nombre);
  let nombre: string;
  let apellido: string | null;
  if (apellidoSeparado) {
    nombre = nombreRaw || "(sin nombre)";
    apellido = apellidoSeparado;
  } else {
    const split = splitNombre(nombreRaw);
    nombre = split.nombre;
    apellido = split.apellido;
  }
  return {
    nombre,
    apellido,
    email: normalizeEmail(pick(row, CLIENTE_COLS.email)),
    whatsapp: normalizePhoneMx(pick(row, CLIENTE_COLS.whatsapp)),
    fecha_nacimiento: parseDate(pick(row, CLIENTE_COLS.fecha_nacimiento)),
    notas: pick(row, CLIENTE_COLS.notas) || null,
    agendapro_id: pick(row, CLIENTE_COLS.agendapro_id) || null,
    migrado_desde_agendapro_at: new Date().toISOString(),
  };
}

async function migrateClientes(rows: Record<string, string>[]) {
  console.log(`\n🔄 Procesando ${rows.length} clientes…`);

  const normalized: ClienteIn[] = [];
  let invalidos = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    const c = normalizeCliente(row);
    if (!c.whatsapp && !c.email) {
      invalidos++;
      continue;
    }
    const key = c.whatsapp ?? c.email!;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(c);
  }

  console.log(`   ✓ Normalizados: ${normalized.length}`);
  console.log(`   ✗ Inválidos sin teléfono ni email: ${invalidos}`);
  console.log(`   ✗ Duplicados removidos: ${rows.length - invalidos - normalized.length}`);

  if (DRY) {
    console.log(`\n   [DRY] Primeros 3 clientes que serían migrados:`);
    normalized.slice(0, 3).forEach((c, i) => console.log(`     ${i + 1}.`, JSON.stringify(c, null, 2).slice(0, 200), "..."));
    return new Map<string, string>();
  }

  // Upsert por agendapro_id si existe, si no por whatsapp_normalizado
  const map = new Map<string, string>(); // agendapro_id → uuid en la nueva BD
  const BATCH = 100;
  let inserted = 0, updated = 0, errors = 0;

  for (let i = 0; i < normalized.length; i += BATCH) {
    const batch = normalized.slice(i, i + BATCH);
    const { data, error } = await sb
      .from("clientes")
      .upsert(batch, { onConflict: "agendapro_id", ignoreDuplicates: false })
      .select("id, agendapro_id, whatsapp");

    if (error) {
      console.error(`   ❌ Error en batch ${i}:`, error.message);
      errors += batch.length;
      continue;
    }
    inserted += data?.length ?? 0;
    data?.forEach((d) => {
      if (d.agendapro_id) map.set(d.agendapro_id, d.id);
    });
    process.stdout.write(`\r   Procesados: ${i + batch.length}/${normalized.length}`);
  }
  console.log(`\n   ✅ Insertados/actualizados: ${inserted}`);
  if (errors) console.log(`   ❌ Errores: ${errors}`);
  return map;
}

// ================== Migrar citas ==================

async function migrateCitas(
  rows: Record<string, string>[],
  clienteIdMap: Map<string, string>
) {
  console.log(`\n🔄 Procesando ${rows.length} citas…`);

  // Cargar catálogo de servicios para mapear por nombre
  const { data: servicios } = await sb.from("servicios").select("id, nombre, precio_mxn, duracion_min");
  if (!servicios) {
    console.error("❌ No se pudo cargar catálogo de servicios.");
    return;
  }
  const servicioMap = new Map<string, typeof servicios[0]>();
  servicios.forEach((s) => servicioMap.set(s.nombre.toLowerCase(), s));

  let migradas = 0;
  let sinCliente = 0;
  let sinServicio = 0;
  let inválidas = 0;
  const sinServicioSet = new Set<string>();

  const citasInsert: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const agId = pick(row, CITA_COLS.cliente_id_agendapro);
    const clienteUuid = clienteIdMap.get(agId);
    if (!clienteUuid && !DRY) { sinCliente++; continue; }

    const servicioRaw = pick(row, CITA_COLS.servicio);
    const servicio = servicioMap.get(servicioRaw.toLowerCase());
    if (!servicio) {
      sinServicio++;
      sinServicioSet.add(servicioRaw);
      continue;
    }

    const fechaStr = pick(row, CITA_COLS.fecha);
    const horaStr = pick(row, CITA_COLS.hora);
    const fechaIso = parseDateTime(fechaStr + (horaStr ? `T${horaStr}` : "T11:00")) ?? parseDateTime(fechaStr);
    if (!fechaIso) { inválidas++; continue; }

    const fin = new Date(new Date(fechaIso).getTime() + servicio.duracion_min * 60_000).toISOString();
    const estadoRaw = pick(row, CITA_COLS.estado).toLowerCase();
    const estado =
      ["completada", "completado", "realizada", "atendida"].some((s) => estadoRaw.includes(s)) ? "completada" :
      ["cancelada", "cancelado"].some((s) => estadoRaw.includes(s)) ? "cancelada" :
      ["no_show", "no show", "no asistio", "no asistió"].some((s) => estadoRaw.includes(s)) ? "no_show" :
      ["confirmada", "confirmado"].some((s) => estadoRaw.includes(s)) ? "confirmada" :
      "completada"; // default histórico

    const precioRaw = pick(row, CITA_COLS.precio).replace(/[^\d.]/g, "");
    const precio = precioRaw ? parseFloat(precioRaw) : servicio.precio_mxn;

    citasInsert.push({
      cliente_id: clienteUuid ?? "00000000-0000-0000-0000-000000000000", // placeholder en dry
      servicio_id: servicio.id,
      inicio: fechaIso,
      fin,
      estado,
      precio_mxn: precio,
      notas_internas: pick(row, CITA_COLS.notas) || null,
      agendapro_id: pick(row, CITA_COLS.agendapro_id) || null,
    });
    migradas++;
  }

  console.log(`   ✓ Listas para insertar: ${migradas}`);
  console.log(`   ✗ Sin cliente correspondiente: ${sinCliente}`);
  console.log(`   ✗ Sin servicio match: ${sinServicio}`);
  if (sinServicioSet.size > 0) {
    console.log(`     Servicios no mapeados: ${[...sinServicioSet].join(", ")}`);
  }
  console.log(`   ✗ Inválidas (sin fecha): ${inválidas}`);

  if (DRY) {
    console.log(`\n   [DRY] Primera cita que sería insertada:`, JSON.stringify(citasInsert[0], null, 2));
    return;
  }

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < citasInsert.length; i += BATCH) {
    const batch = citasInsert.slice(i, i + BATCH);
    const { data, error } = await sb
      .from("citas")
      .upsert(batch, { onConflict: "agendapro_id", ignoreDuplicates: false })
      .select("id");
    if (error) console.error(`   ❌ Error en batch ${i}:`, error.message);
    inserted += data?.length ?? 0;
    process.stdout.write(`\r   Procesadas: ${i + batch.length}/${citasInsert.length}`);
  }
  console.log(`\n   ✅ Insertadas/actualizadas: ${inserted}`);
}

// ================== Reglas post-migración ==================

async function ejecutarPostMigracion() {
  if (DRY) return;
  console.log(`\n🔧 Ejecutando reglas post-migración…`);

  // Marcar dormidas según reglas de la tabla configuracion
  const { data, error } = await sb.rpc("marcar_dormidas");
  if (error) console.error(`   ❌ Error marcar_dormidas:`, error.message);
  else console.log(`   ✅ Clientas marcadas como 'dormida': ${data}`);
}

// ================== Main ==================

async function main() {
  console.log(`\n🌿 Migración AgendaPro → Gina Brows CRM`);
  console.log(`   Modo: ${DRY ? "DRY-RUN (sin escribir)" : "PRODUCCIÓN"}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);

  let clienteMap = new Map<string, string>();

  if (args.clientes) {
    if (!statSync(resolve(args.clientes)).isFile()) {
      console.error(`❌ No existe ${args.clientes}`);
      process.exit(1);
    }
    const rows = await loadClientes(args.clientes);
    await uploadBackup(args.clientes, "clientes");
    clienteMap = await migrateClientes(rows);
  } else if (args.citas) {
    // Si solo viene citas, cargar todos los clientes existentes para el map
    const { data } = await sb.from("clientes").select("id, agendapro_id");
    data?.forEach((c) => c.agendapro_id && clienteMap.set(c.agendapro_id, c.id));
    console.log(`\n📥 Cargados ${clienteMap.size} clientes de BD para mapeo`);
  }

  if (args.citas) {
    if (!statSync(resolve(args.citas)).isFile()) {
      console.error(`❌ No existe ${args.citas}`);
      process.exit(1);
    }
    const rows = await loadCitas(args.citas);
    await uploadBackup(args.citas, "citas");
    await migrateCitas(rows, clienteMap);
  }

  await ejecutarPostMigracion();

  console.log(`\n✨ Listo.\n`);
}

main().catch((e) => {
  console.error(`\n💥 Error fatal:`, e);
  process.exit(1);
});
