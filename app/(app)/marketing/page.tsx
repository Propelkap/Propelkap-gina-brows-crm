import { createClient } from "@/lib/supabase/server";
import MarketingClient from "./MarketingClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sb = await createClient();
  const { data: templates } = await sb
    .from("email_templates")
    .select("*")
    .eq("archivado", false)
    .order("ultimo_uso", { ascending: false, nullsFirst: false });
  return <MarketingClient templates={templates ?? []} />;
}
