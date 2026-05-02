import { createClient } from "@/lib/supabase/server";
import RetencionClient from "./RetencionClient";

export const dynamic = "force-dynamic";

type Search = { tab?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const { tab = "dormidas" } = await searchParams;
  const supabase = await createClient();

  const [dormidasRes, ret60Res, retAnualRes, cumplesRes, crossRes, segmentosRes] = await Promise.all([
    supabase.from("v_clientas_dormidas").select("*"),
    supabase.from("v_retoques_60d_pendientes").select("*"),
    supabase.from("v_retoques_anuales_pendientes").select("*"),
    supabase.from("v_cumpleanos_proximos").select("*"),
    supabase.from("v_cross_sell_sugerido").select("*"),
    supabase.from("v_cartera_segmentos_resumen").select("*"),
  ]);

  return (
    <RetencionClient
      tab={tab}
      dormidas={dormidasRes.data ?? []}
      retoques60={ret60Res.data ?? []}
      retoquesAnuales={retAnualRes.data ?? []}
      cumples={cumplesRes.data ?? []}
      crossSell={crossRes.data ?? []}
      segmentos={segmentosRes.data ?? []}
    />
  );
}
