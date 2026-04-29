"use client";

import { useState } from "react";
import { Save, Sparkles, Check, X, AlertCircle, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import FeedbackBot from "./FeedbackBot";

type CalendarToken = { created_at: string; expires_at: string; scope: string | null } | null | undefined;

const fmtMxn = (n: number | null) =>
  n != null
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n))
    : "—";

export default function ConfiguracionClient({
  config, servicios, calendarToken, calendarFlash,
}: {
  config: any;
  servicios: any[];
  calendarToken?: CalendarToken;
  calendarFlash?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState({
    nombre_estudio: config?.nombre_estudio ?? "",
    whatsapp_estudio: config?.whatsapp_estudio ?? "",
    email_estudio: config?.email_estudio ?? "",
    direccion: config?.direccion ?? "",
    ciudad: config?.ciudad ?? "",
    google_review_link: config?.google_review_link ?? "",
    anticipo_porcentaje_default: config?.anticipo_porcentaje_default ?? 50,
    dias_dormida: config?.dias_dormida ?? 180,
    voz_bot_system_prompt: config?.voz_bot_system_prompt ?? "",
    frases_si: (config?.frases_si ?? []).join("\n"),
    frases_no: (config?.frases_no ?? []).join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    const sb = createClient();
    const payload = {
      ...data,
      frases_si: data.frases_si.split("\n").map((s: string) => s.trim()).filter(Boolean),
      frases_no: data.frases_no.split("\n").map((s: string) => s.trim()).filter(Boolean),
    };
    await sb.from("configuracion").update(payload).eq("id", 1);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="max-w-4xl">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <p className="eyebrow">Configuración del estudio</p>
          <h1 className="text-3xl mt-1">Tu marca, tu voz, tus reglas</h1>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saved ? <><Check className="w-4 h-4" /> Guardado</> : <><Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar"}</>}
        </button>
      </header>

      <Section title="Datos del estudio">
        <Field label="Nombre del estudio" value={data.nombre_estudio} onChange={(v) => setData({ ...data, nombre_estudio: v })} />
        <Field label="WhatsApp principal" value={data.whatsapp_estudio} onChange={(v) => setData({ ...data, whatsapp_estudio: v })} placeholder="+528130791032" />
        <Field label="Email" value={data.email_estudio} onChange={(v) => setData({ ...data, email_estudio: v })} placeholder="hola@ginabrows.com" />
        <Field label="Dirección" value={data.direccion} onChange={(v) => setData({ ...data, direccion: v })} />
        <Field label="Ciudad" value={data.ciudad} onChange={(v) => setData({ ...data, ciudad: v })} />
        <Field label="Link reseña Google" value={data.google_review_link} onChange={(v) => setData({ ...data, google_review_link: v })} placeholder="https://g.page/r/..." />
      </Section>

      <Section title="Voz de marca">
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Estas frases se usan en el bot de WhatsApp y en cada mensaje automático. Refleja tu personalidad real.
        </p>
        <Field
          label="Frases que SÍ usas (una por línea)"
          value={data.frases_si}
          onChange={(v) => setData({ ...data, frases_si: v })}
          textarea
          rows={5}
        />
        <Field
          label="Frases que NUNCA usarías"
          value={data.frases_no}
          onChange={(v) => setData({ ...data, frases_no: v })}
          textarea
          rows={4}
        />
        <Field
          label="Instrucciones al bot IA"
          value={data.voz_bot_system_prompt}
          onChange={(v) => setData({ ...data, voz_bot_system_prompt: v })}
          textarea
          rows={6}
        />
      </Section>

      <Section title="Integraciones">
        <CalendarIntegration token={calendarToken} flash={calendarFlash} router={router} />
      </Section>

      <Section title="Reglas operativas">
        <Field label="% de anticipo por defecto" value={String(data.anticipo_porcentaje_default)} onChange={(v) => setData({ ...data, anticipo_porcentaje_default: parseInt(v) || 50 })} />
        <Field label="Días para considerar 'dormida'" value={String(data.dias_dormida)} onChange={(v) => setData({ ...data, dias_dormida: parseInt(v) || 180 })} />
      </Section>

      <Section title="Aprendizaje del bot">
        <FeedbackBot />
      </Section>

      <Section title={`Catálogo de servicios (${servicios.length})`}>
        <div className="card !p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="text-left px-4 py-2.5 font-medium">Servicio</th>
                <th className="text-left px-3 py-2.5 font-medium">Categoría</th>
                <th className="text-right px-3 py-2.5 font-medium">Precio</th>
                <th className="text-right px-3 py-2.5 font-medium">Duración</th>
                <th className="text-right px-4 py-2.5 font-medium">Retoque</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2.5 text-sm font-medium">{s.nombre}</td>
                  <td className="px-3 py-2.5 text-sm text-[var(--muted-foreground)]">{s.categoria}</td>
                  <td className="px-3 py-2.5 text-sm text-right font-mono">{fmtMxn(Number(s.precio_mxn))}</td>
                  <td className="px-3 py-2.5 text-sm text-right">{s.duracion_min} min</td>
                  <td className="px-4 py-2.5 text-sm text-right text-[var(--muted-foreground)]">
                    {s.retoque_dias_obligatorio ? `${s.retoque_dias_obligatorio}d` : "—"}
                    {s.retoque_anual_dias ? ` + ${s.retoque_anual_dias}d` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          La edición inline de servicios llega en próximo despliegue. Por ahora editable desde Supabase directo.
        </p>
      </Section>
    </div>
  );
}

function CalendarIntegration({ token, flash, router }: { token: CalendarToken; flash?: string; router: any }) {
  const [busy, setBusy] = useState(false);
  const [showFlash, setShowFlash] = useState(!!flash);

  async function disconnect() {
    if (!confirm("¿Desconectar Google Calendar? Las nuevas citas dejarán de sincronizarse.")) return;
    setBusy(true);
    await fetch("/api/calendar/disconnect", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  const flashMessages: Record<string, { msg: string; ok: boolean }> = {
    connected: { msg: "✓ Google Calendar conectado correctamente.", ok: true },
    error: { msg: "Hubo un error en el flujo de OAuth. Intenta de nuevo.", ok: false },
    token_error: { msg: "No pude intercambiar el código por tokens. Verifica las credenciales.", ok: false },
  };
  const flashData = flash ? flashMessages[flash] : null;

  return (
    <>
      {flashData && showFlash && (
        <div className={`flex items-start justify-between gap-3 p-4 rounded-2xl border ${
          flashData.ok
            ? "bg-[var(--sage-light)] border-[var(--sage-deep)] text-[var(--sage-deep)]"
            : "bg-[hsl(0_84%_60%_/_0.08)] border-[var(--destructive)] text-[var(--destructive)]"
        }`}>
          <p className="text-sm font-medium">{flashData.msg}</p>
          <button onClick={() => setShowFlash(false)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="card flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--secondary)]/40 flex items-center justify-center text-lg shrink-0">
            📅
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold mb-1">Google Calendar</p>
            {token ? (
              <>
                <p className="text-sm text-[var(--sage-deep)] flex items-center gap-1.5 mb-1">
                  <Check className="w-3.5 h-3.5" /> Conectado
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Desde {new Date(token.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} · token vigente hasta {new Date(token.expires_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Las citas confirmadas con Stripe se agregarán automáticamente al calendario, con la clienta como invitada por email.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Conecta tu calendario para que las citas confirmadas con Stripe se agreguen automáticamente, con la clienta como invitada por email.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {token ? (
            <>
              <a href="/api/calendar/connect" className="btn-ghost !text-xs">Reconectar</a>
              <button onClick={disconnect} disabled={busy} className="btn-ghost !text-xs text-[var(--destructive)]">
                {busy ? "Desconectando…" : "Desconectar"}
              </button>
            </>
          ) : (
            <a href="/api/calendar/connect" className="btn-primary !text-xs">Conectar</a>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label, value, onChange, placeholder, textarea, rows,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean; rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}
