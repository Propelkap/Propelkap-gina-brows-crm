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
  const { data: servicio } = await sb.from("servicios").select("duracion_min, precio_mxn, sesiones_paquete").eq("id", servicio_id).single();
  if (!servicio) return NextResponse.json({ error: "Servicio inválido" }, { status: 400 });

  const inicioDt = new Date(inicio);
  const finDt = new Date(inicioDt.getTime() + servicio.duracion_min * 60_000);

  // Si es paquete (sesiones_paquete > 1), calcular sesión + precio correcto
  let paqueteData: { paquete_grupo_id: string | null; sesion_numero: number | null; sesiones_totales: number | null; precio_calculado: number } = {
    paquete_grupo_id: null,
    sesion_numero: null,
    sesiones_totales: null,
    precio_calculado: precio_mxn ?? Number(servicio.precio_mxn),
  };

  if ((servicio.sesiones_paquete ?? 1) > 1) {
    const { data: paq } = await sb.rpc("calcular_proxima_sesion_paquete", {
      p_cliente_id: cliente_id,
      p_servicio_id: servicio_id,
    });
    if (paq && paq.length > 0) {
      const r = paq[0];
      // SIEMPRE confiar en el RPC para paquetes (1ra cobra total, 2da+ cobra 0).
      // Ignoramos el precio_mxn que mande el frontend para evitar que el usuario duplique cobros.
      paqueteData = {
        paquete_grupo_id: r.paquete_grupo_id,
        sesion_numero: r.sesion_numero,
        sesiones_totales: r.sesiones_totales,
        precio_calculado: Number(r.precio_mxn),
      };
    }
  }

  const { data, error } = await sb
    .from("citas")
    .insert({
      cliente_id,
      servicio_id,
      inicio: inicioDt.toISOString(),
      fin: finDt.toISOString(),
      precio_mxn: paqueteData.precio_calculado,
      anticipo_mxn: anticipo_mxn ?? 0,
      estado: "tentativa",
      notas_internas: notas_internas || null,
      paquete_grupo_id: paqueteData.paquete_grupo_id,
      sesion_numero: paqueteData.sesion_numero,
      sesiones_totales: paqueteData.sesiones_totales,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
