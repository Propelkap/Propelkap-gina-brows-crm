import { NextResponse } from "next/server";
import {
  createOrConnectInstance,
  INSTANCE_NAME,
  setInstanceWebhook,
} from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const qr = await createOrConnectInstance(INSTANCE_NAME);

    // Auto-registrar webhook hacia este mismo deployment.
    // Vercel expone VERCEL_URL = "<deploy>-<hash>.vercel.app" pero queremos
    // el alias estable. Con NEXT_PUBLIC_APP_URL podemos forzarlo; si no,
    // derivamos del request actual.
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      new URL(req.url).origin;
    const webhookUrl = `${origin}/api/webhooks/whatsapp`;

    // No bloquear si el webhook falla — la conexión sigue siendo útil
    setInstanceWebhook(INSTANCE_NAME, webhookUrl).catch((e) =>
      console.warn("setInstanceWebhook failed:", (e as Error).message)
    );

    return NextResponse.json({
      ok: true,
      instance: INSTANCE_NAME,
      qrcode: qr.base64,
      pairingCode: qr.pairingCode,
      webhook: webhookUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
