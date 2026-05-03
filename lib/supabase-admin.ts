import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente admin (service role). Solo se usa server-side para
 * operaciones que ignoran RLS (webhooks, jobs, migraciones).
 */
let _admin: SupabaseClient | null = null;

export function adminSb(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase no configurado (faltan envs)");
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export function hasSupabase(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
