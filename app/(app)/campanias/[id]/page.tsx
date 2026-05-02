import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, Clock, AlertTriangle, Eye, EyeOff, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Monterrey",
  }) : "—";

// Mapeo estado_entrega → categoria operativa
const ESTADO_CAT: Record<string, string> = {
  queued: "encolado",
  accepted: "encolado",
  sending: "enviando",
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  received: "entregado",
  failed: "fallido",
  undelivered: "fallido",
  rejected: "fallido",
  simulado: "simulado",
};

const ESTADO_COLOR: Record<string, string> = {
  encolado: "var(--muted-foreground)",
  enviando: "var(--warning)",
  enviado: "var(--primary-dark)",
  entregado: "var(--sage-deep)",
  leido: "var(--sage-deep)",
  fallido: "var(--destructive)",
  simulado: "var(--muted-foreground)",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const [campRes, comuRes] = await Promise.all([
    sb.from("campanias").select("*").eq("id", id).maybeSingle(),
    sb.from("comunicaciones")
      .select("id, cliente_id, estado_entrega, error_codigo, error_mensaje, twilio_sid, created_at, cliente:clientes(nombre, apellido, whatsapp)")
      .eq("campania_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!campRes.data) notFound();
  const camp = campRes.data;
  const comus = comuRes.data ?? [];

  // Agregar contadores por categoria operativa
  const counts: Record<string, number> = {
    encolado: 0, enviando: 0, enviado: 0, entregado: 0, leido: 0, fallido: 0, simulado: 0,
  };
  for (const c of comus as any[]) {
    const cat = ESTADO_CAT[c.estado_entrega || ""] ?? "enviado";
    counts[cat] = (counts[cat] ?? 0) + 1;
  }

  const total = camp.total_destinatarios ?? comus.length;
  const exitosos = counts.entregado + counts.leido;
  const fallidos = counts.fallido;
  const pendientes = counts.encolado + counts.enviando + counts.enviado;
  const tasaEntrega = total > 0 ? Math.round(((counts.entregado + counts.leido + counts.enviado) / total) * 100) : 0;
  const tasaLectura = (counts.entregado + counts.leido) > 0
    ? Math.round((counts.leido / (counts.entregado + counts.leido)) * 100)
    : 0;

  // Listar errores agrupados
  const errores = (comus as any[])
    .filter((c) => c.error_codigo || c.error_mensaje)
    .reduce((acc, c) => {
      const key = c.error_codigo || c.error_mensaje?.slice(0, 60) || "sin código";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return (
    <div className="max-w-6xl">
      <Link href="/campanias" className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Volver a campañas
      </Link>

      <header className="mb-6">
        <p className="eyebrow capitalize">{camp.tipo} · {camp.estado}</p>
        <h1 className="text-2xl md:text-3xl mt-1">{camp.nombre}</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Lanzada {fmtDateTime(camp.iniciada_at)} · {total} destinatarias · template{" "}
          <code className="text-xs bg-[var(--card)] px-1.5 py-0.5 rounded">{camp.template_meta ?? "—"}</code>
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi label="Tasa entrega" value={`${tasaEntrega}%`} hint={`${exitosos + counts.enviado} de ${total}`} accent="primary" />
        <Kpi label="Tasa lectura" value={`${tasaLectura}%`} hint={`${counts.leido} leídas`} accent="sage" />
        <Kpi label="Entregadas" value={String(counts.entregado + counts.leido)} hint="✓✓" accent="sage" icon={<CheckCircle2 />} />
        <Kpi label="Pendientes" value={String(pendientes)} hint="en cola/sent" accent="warning" icon={<Clock />} />
        <Kpi label="Fallos" value={String(fallidos)} hint="undelivered/failed" accent={fallidos > 0 ? "destructive" : "muted"} icon={<AlertTriangle />} />
      </div>

      {/* Errores agrupados */}
      {Object.keys(errores).length > 0 && (
        <div className="card mb-6 border border-[var(--destructive)]/30">
          <p className="eyebrow !text-[var(--destructive)] mb-2">Errores frecuentes</p>
          <div className="space-y-1 text-xs">
            {Object.entries(errores).map(([key, n]) => (
              <div key={key} className="flex items-center justify-between border-b border-[var(--border)] last:border-0 py-1.5">
                <code className="text-[var(--destructive)]">{key}</code>
                <span className="font-mono font-semibold">{String(n)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de destinatarios */}
      <div className="card !p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              <th className="text-left px-4 py-2.5 font-medium">Clienta</th>
              <th className="text-left px-3 py-2.5 font-medium">WhatsApp</th>
              <th className="text-left px-3 py-2.5 font-medium">Estado</th>
              <th className="text-left px-3 py-2.5 font-medium">Twilio SID</th>
              <th className="text-left px-3 py-2.5 font-medium">Hora envío</th>
              <th className="text-left px-3 py-2.5 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {(comus as any[]).map((c) => {
              const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
              const cat = ESTADO_CAT[c.estado_entrega || ""] ?? "enviado";
              return (
                <tr key={c.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/30">
                  <td className="px-4 py-2.5 text-sm">
                    <Link href={`/clientas/${c.cliente_id}`} className="font-medium hover:underline">
                      {cliente?.nombre} {cliente?.apellido}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-sm font-mono text-[var(--muted-foreground)]">{cliente?.whatsapp ?? "—"}</td>
                  <td className="px-3 py-2.5 text-sm">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase"
                      style={{ color: ESTADO_COLOR[cat], backgroundColor: ESTADO_COLOR[cat] + "1a" }}
                    >
                      {cat === "leido" && <Eye className="w-3 h-3" />}
                      {cat === "entregado" && <CheckCircle2 className="w-3 h-3" />}
                      {cat === "fallido" && <AlertTriangle className="w-3 h-3" />}
                      {cat === "encolado" && <Clock className="w-3 h-3" />}
                      {cat}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[10px] font-mono text-[var(--muted-foreground)] truncate max-w-[140px]">
                    {c.twilio_sid ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--muted-foreground)]">{fmtDateTime(c.created_at)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--destructive)]">
                    {c.error_codigo && <span className="font-mono">{c.error_codigo}</span>}
                    {c.error_mensaje && <div className="text-[10px]">{c.error_mensaje.slice(0, 80)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {comus.length === 0 && (
          <div className="px-4 py-12 text-center text-[var(--muted-foreground)] text-sm">
            Sin destinatarios registrados todavía. Recarga en unos segundos si la campaña acaba de empezar.
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--muted-foreground)] mt-4 text-center">
        Estado se actualiza en vivo conforme Twilio reporta status callbacks.
        Refresca la página para ver últimos cambios.
      </p>
    </div>
  );
}

function Kpi({
  label, value, hint, accent, icon,
}: {
  label: string;
  value: string;
  hint: string;
  accent: "primary" | "sage" | "warning" | "destructive" | "muted";
  icon?: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    primary: "var(--primary-dark)",
    sage: "var(--sage-deep)",
    warning: "var(--warning)",
    destructive: "var(--destructive)",
    muted: "var(--muted-foreground)",
  };
  return (
    <div className="card text-center" style={{ borderTop: `3px solid ${colorMap[accent]}` }}>
      {icon && <div className="text-[var(--muted-foreground)] mb-1 flex justify-center [&>svg]:w-4 [&>svg]:h-4">{icon}</div>}
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">{label}</div>
      <div className="text-2xl font-bold" style={{ color: colorMap[accent] }}>{value}</div>
      <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{hint}</div>
    </div>
  );
}
