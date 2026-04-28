import { createClient } from "@/lib/supabase/server";
import ClientesClient from "./ClientesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre, apellido, whatsapp, email, estado, total_citas, total_gastado_mxn, ultima_cita_fecha, proxima_cita_fecha")
    .eq("archivada", false)
    .order("total_gastado_mxn", { ascending: false, nullsFirst: false })
    .limit(1000);

  return <ClientesClient clientes={clientes ?? []} />;
}
