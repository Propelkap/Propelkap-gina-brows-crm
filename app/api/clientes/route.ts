import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normPhone(raw: string): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^0-9+]/g, "");
  if (!p) return null;
  if (p.startsWith("+52")) return p;
  if (p.startsWith("52") && p.length >= 12) return `+${p}`;
  if (p.length === 10) return `+52${p}`;
  return p.startsWith("+") ? p : `+${p}`;
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, apellido, email, whatsapp, fecha_nacimiento, notas, origen_lead } = body;

  if (!nombre || (!whatsapp && !email)) {
    return NextResponse.json({ error: "Falta nombre y al menos teléfono o email" }, { status: 400 });
  }

  const wa = whatsapp ? normPhone(whatsapp) : null;

  const { data, error } = await sb
    .from("clientes")
    .insert({
      nombre,
      apellido: apellido || null,
      email: email?.toLowerCase().trim() || null,
      whatsapp: wa,
      fecha_nacimiento: fecha_nacimiento || null,
      notas: notas || null,
      origen_lead: origen_lead || "otro",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
