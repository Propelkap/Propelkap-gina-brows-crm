import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Inicia OAuth con Google Calendar
export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`;

  if (!clientId) {
    return NextResponse.json({
      error: "Google Calendar no configurado",
      hint: "Falta GOOGLE_CALENDAR_CLIENT_ID en envs. Crear OAuth client en https://console.cloud.google.com/apis/credentials con redirect_uri = " + redirectUri,
    }, { status: 503 });
  }

  const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events");
  const state = user.id;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;

  return NextResponse.redirect(url);
}
