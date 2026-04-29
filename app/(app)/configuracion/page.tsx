import { createClient } from "@/lib/supabase/server";
import ConfiguracionClient from "./ConfiguracionClient";

export const dynamic = "force-dynamic";

type Search = { calendar?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const { calendar } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [confRes, servRes, tokenRes] = await Promise.all([
    supabase.from("configuracion").select("*").eq("id", 1).single(),
    supabase.from("servicios").select("*").order("orden", { ascending: true }),
    user ? supabase.from("calendar_tokens").select("created_at, expires_at, scope").eq("usuario_id", user.id).eq("proveedor", "google").maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <ConfiguracionClient
      config={confRes.data}
      servicios={servRes.data ?? []}
      calendarToken={tokenRes.data}
      calendarFlash={calendar}
    />
  );
}
