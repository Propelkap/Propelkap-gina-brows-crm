/**
 * POST /api/push/test
 * Manda una notificacion de prueba al usuario logueado para verificar
 * que la suscripcion funciona end-to-end.
 */
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";

export async function POST() {
  const sbAuth = await createClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sb = createServiceClient();
  const result = await sendPush(sb, { usuarioId: user.id }, {
    title: "🌿 Notificación de prueba",
    body: "Si ves esto, las push notifications están operativas.",
    url: "/configuracion",
    tag: "test-push",
  });
  return NextResponse.json({ ok: true, ...result });
}
