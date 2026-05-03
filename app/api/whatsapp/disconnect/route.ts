import { NextResponse } from "next/server";
import { deleteInstance, logoutInstance, INSTANCE_NAME } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Por default hacemos logout (corta la sesión WA pero deja la instancia para
 * reconectar rápido). Si ?hard=1 → borra la instancia completa.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const hard = searchParams.get("hard") === "1";

  try {
    if (hard) {
      await deleteInstance(INSTANCE_NAME);
    } else {
      await logoutInstance(INSTANCE_NAME);
    }
    return NextResponse.json({ ok: true, mode: hard ? "deleted" : "logged_out" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
