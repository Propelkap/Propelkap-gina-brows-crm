import { NextResponse } from "next/server";
import { getInstanceStatus, INSTANCE_NAME } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getInstanceStatus(INSTANCE_NAME);
    return NextResponse.json({ ok: true, instance: INSTANCE_NAME, ...status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
