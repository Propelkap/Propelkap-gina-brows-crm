import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { cliente_id, servicio_id, inicio, precio_mxn, anticipo_mxn, notas_internas } = body;

  if (!cliente_id || !servicio_id || !inicio) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }

  // Calcular fin con duración del servicio
  const { data: servicio } = await sb.from("servicios").select("duracion_min, precio_mxn").eq("id", servicio_id).single();
  if (!servicio) return NextResponse.json({ error: "Servicio inválido" }, { status: 400 });

  const inicioDt = new Date(inicio);
  const finDt = new Date(inicioDt.getTime() + servicio.duracion_min * 60_000);

  const { data, error } = await sb
    .from("citas")
    .insert({
      cliente_id,
      servicio_id,
      inicio: inicioDt.toISOString(),
      fin: finDt.toISOString(),
      precio_mxn: precio_mxn ?? servicio.precio_mxn,
      anticipo_mxn: anticipo_mxn ?? 0,
      estado: "tentativa",
      notas_internas: notas_internas || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
