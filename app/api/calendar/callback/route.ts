import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // usuario_id
  if (!code || !state) return NextResponse.redirect(new URL("/configuracion?calendar=error", req.url));

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`;

  // Intercambiar code por tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/configuracion?calendar=token_error", req.url));
  }
  const tokens = await tokenRes.json();

  // Guardar en BD
  const sb = createServiceClient();
  await sb.from("calendar_tokens").upsert({
    usuario_id: state,
    proveedor: "google",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    scope: tokens.scope,
  }, { onConflict: "usuario_id,proveedor" });

  return NextResponse.redirect(new URL("/configuracion?calendar=connected", req.url));
}
