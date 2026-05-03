import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Modo demo: si Supabase no está configurado, dejar pasar todo.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Rutas públicas — endpoints con auth propia (CRON_SECRET,
  // INTAKE_WEBHOOK_SECRET, status callbacks de Twilio) NO deben pasar
  // por el middleware de Supabase porque no tienen cookie de sesión.
  const publicPaths = [
    "/login",
    "/auth",
    "/api/webhooks",            // Twilio (whatsapp, twilio-status), Stripe
    "/api/cron",                // Vercel Crons + GitHub Actions Cron
    "/api/notif",               // webhook intake-completado del form externo
    "/api/consentimientos",     // form público de firma (token-based)
    "/consentimiento",          // página pública del form de firma
    "/api/tenant-healthcheck",
  ];
  const isPublic = publicPaths.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|ttf)$).*)"],
};
