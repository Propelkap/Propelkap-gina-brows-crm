import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { pausado, motivo } = await req.json();

  const { error } = await sb
    .from("clientes")
    .update({
      bot_pausado: pausado,
      bot_pausado_at: pausado ? new Date().toISOString() : null,
      bot_pausado_motivo: pausado ? (motivo || null) : null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
