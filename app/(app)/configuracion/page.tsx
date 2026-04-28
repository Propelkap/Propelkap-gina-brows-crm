import { createClient } from "@/lib/supabase/server";
import ConfiguracionClient from "./ConfiguracionClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const [confRes, servRes] = await Promise.all([
    supabase.from("configuracion").select("*").eq("id", 1).single(),
    supabase.from("servicios").select("*").order("orden", { ascending: true }),
  ]);
  return <ConfiguracionClient config={confRes.data} servicios={servRes.data ?? []} />;
}
