/**
 * Cliente mínimo de Evolution API (Baileys integration).
 * Lee credenciales de env vars; nunca expongas EVOLUTION_API_KEY al browser.
 *
 * Patrón de naming: el sandbox usa un instanceName fijo. Cuando portemos al
 * template, esto se vuelve `member_${userSlug}` parametrizado.
 */

export const INSTANCE_NAME = process.env.WHATSAPP_INSTANCE_NAME ?? "";
if (!INSTANCE_NAME && typeof window === "undefined") console.warn("WHATSAPP_INSTANCE_NAME no configurada");

export type ConnectionState = "open" | "close" | "connecting";

export type EvolutionQR = {
  pairingCode: string | null;
  code: string;
  base64: string; // data URL listo para <img src="...">
  count?: number;
};

export type StatusPayload = {
  state: ConnectionState;
  phone: string | null; // E.164 sin +, ej "5215512345678"
  profileName: string | null;
};

function evoHeaders() {
  const key = process.env.EVOLUTION_API_KEY;
  if (!key) throw new Error("EVOLUTION_API_KEY no configurada");
  return {
    apikey: key,
    "Content-Type": "application/json",
  };
}

function evoBase() {
  const url = process.env.EVOLUTION_API_URL;
  if (!url) throw new Error("EVOLUTION_API_URL no configurada");
  return url.replace(/\/$/, "");
}

/**
 * Registra (o sobrescribe) la URL de webhook de la instancia.
 * Eventos suscritos: MESSAGES_UPSERT (mensajes nuevos), CONNECTION_UPDATE
 * (estado de conexión), QRCODE_UPDATED (QR refresh).
 *
 * Idempotente: se puede llamar varias veces sin efectos adversos.
 */
export async function setInstanceWebhook(
  instanceName: string,
  webhookUrl: string
): Promise<void> {
  const base = evoBase();
  const headers = evoHeaders();

  const res = await fetch(`${base}/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        base64: true, // necesario para que media (imágenes/audio/docs) llegue embebido en base64
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    // No tiramos la conexión por esto, solo logueamos
    console.warn(`Evolution setWebhook warning ${res.status}: ${txt}`);
  }
}

/**
 * Crea una instancia y devuelve el QR. Si ya existe, se vuelve a llamar
 * /instance/connect para refrescar el QR sin recrear.
 */
export async function createOrConnectInstance(
  instanceName: string
): Promise<EvolutionQR> {
  const base = evoBase();
  const headers = evoHeaders();

  // ¿Ya existe?
  const list = await fetch(
    `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
    { headers, cache: "no-store" }
  );
  const arr = (await list.json()) as Array<{ name: string; connectionStatus?: string }>;
  const exists = Array.isArray(arr) && arr.length > 0;

  if (!exists) {
    // Crear nueva instancia (esto regresa qrcode embebido)
    const res = await fetch(`${base}/instance/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    if (!res.ok) {
      throw new Error(`Evolution create failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { qrcode: EvolutionQR };
    return data.qrcode;
  }

  // Ya existe: pedir QR fresh por /connect
  const res = await fetch(`${base}/instance/connect/${encodeURIComponent(instanceName)}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Evolution connect failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as EvolutionQR;
}

/**
 * Estado actual + datos del owner cuando ya está conectado.
 */
export async function getInstanceStatus(instanceName: string): Promise<StatusPayload> {
  const base = evoBase();
  const headers = evoHeaders();

  const stateRes = await fetch(
    `${base}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { headers, cache: "no-store" }
  );

  // Si la instancia no existe, Evolution devuelve 404 — lo tratamos como "close"
  if (stateRes.status === 404) {
    return { state: "close", phone: null, profileName: null };
  }

  const stateData = (await stateRes.json()) as {
    instance?: { state?: ConnectionState };
  };
  const state = stateData.instance?.state ?? "close";

  let phone: string | null = null;
  let profileName: string | null = null;

  if (state === "open") {
    const detailRes = await fetch(
      `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { headers, cache: "no-store" }
    );
    const arr = (await detailRes.json()) as Array<{
      ownerJid?: string;
      profileName?: string;
    }>;
    const inst = arr?.[0];
    if (inst?.ownerJid) {
      // ownerJid viene como "5215512345678@s.whatsapp.net" — quedarnos con el número
      phone = inst.ownerJid.split("@")[0] ?? null;
    }
    profileName = inst?.profileName ?? null;
  }

  return { state, phone, profileName };
}

/**
 * Manda un mensaje de texto. `number` debe ser solo dígitos (sin `+`, sin `@s.whatsapp.net`).
 */
export async function sendTextMessage(
  instanceName: string,
  number: string,
  text: string
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const base = evoBase();
  const headers = evoHeaders();

  const cleanNumber = number.replace(/\D/g, "");
  if (!cleanNumber) return { ok: false, error: "Número inválido" };

  const res = await fetch(`${base}/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      number: cleanNumber,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, error: `Evolution sendText ${res.status}: ${errBody}` };
  }

  const data = (await res.json()) as { key?: { id?: string } };
  return { ok: true, messageId: data?.key?.id };
}

/**
 * Logout (cierra sesión WA pero conserva la instancia).
 */
export async function logoutInstance(instanceName: string): Promise<void> {
  const base = evoBase();
  await fetch(`${base}/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    headers: evoHeaders(),
  });
}

/**
 * Delete (borra la instancia completa). Para reset total.
 */
export async function deleteInstance(instanceName: string): Promise<void> {
  const base = evoBase();
  await fetch(`${base}/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    headers: evoHeaders(),
  });
}
