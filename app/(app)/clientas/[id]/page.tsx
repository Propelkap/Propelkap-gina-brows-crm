import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Phone, Mail, Calendar, Cake, MapPin, AlertTriangle, Heart, Sparkles, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtMxn = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n))
    : "$0";

const fmtDate = (d: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", ...opts });
};

const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  completada: { label: "Completada", color: "text-[var(--success)]" },
  no_show: { label: "No asistió", color: "text-[var(--destructive)]" },
  cancelada: { label: "Cancelada", color: "text-[var(--muted-foreground)]" },
  confirmada: { label: "Confirmada", color: "text-[var(--sage-deep)]" },
  tentativa: { label: "Pendiente", color: "text-[var(--warning)]" },
  reagendada: { label: "Reagendada", color: "text-[var(--muted-foreground)]" },
};

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [clienteRes, citasRes, procRes] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", id).single(),
    supabase.from("citas").select("*, servicio:servicios(nombre, categoria)").eq("cliente_id", id).order("inicio", { ascending: false }),
    supabase.from("procedimientos").select("*, servicio:servicios(nombre)").eq("cliente_id", id).order("fecha_realizacion", { ascending: false }),
  ]);

  if (clienteRes.error || !clienteRes.data) notFound();
  const cliente = clienteRes.data;
  const citas = citasRes.data ?? [];
  const procedimientos = procRes.data ?? [];

  // Próximos retoques calculados
  const today = new Date().toISOString().slice(0, 10);
  const retoque60d = procedimientos.find((p) => p.proximo_retoque_60d_fecha && p.proximo_retoque_60d_fecha >= today);
  const retoqueAnual = procedimientos.find((p) => p.proximo_retoque_anual_fecha && p.proximo_retoque_anual_fecha >= today);
  const retoque60dVencido = procedimientos.find((p) => p.proximo_retoque_60d_fecha && p.proximo_retoque_60d_fecha < today);
  const retoqueAnualVencido = procedimientos.find((p) => p.proximo_retoque_anual_fecha && p.proximo_retoque_anual_fecha < today);

  // WhatsApp link directo
  const waLink = cliente.whatsapp
    ? `https://wa.me/${cliente.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hello, hello ${cliente.nombre} 🌿 `)}`
    : null;

  return (
    <div className="max-w-5xl">
      <Link href="/clientas" className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-4">
        <ChevronLeft className="w-4 h-4" /> Volver a clientas
      </Link>

      {/* Header con datos personales */}
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <div className="md:col-span-2 card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl mb-1">{cliente.nombre} {cliente.apellido}</h1>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--sage-light)] text-[var(--sage-deep)] capitalize">
                {cliente.estado}
              </span>
            </div>
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer" className="btn-primary !text-xs">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Datapoint icon={<Phone className="w-3.5 h-3.5" />} label="WhatsApp" value={cliente.whatsapp ?? "—"} mono />
            <Datapoint icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={cliente.email ?? "—"} />
            <Datapoint icon={<Cake className="w-3.5 h-3.5" />} label="Cumpleaños" value={fmtDate(cliente.fecha_nacimiento, { year: undefined })} />
            <Datapoint icon={<Calendar className="w-3.5 h-3.5" />} label="Cliente desde" value={fmtDate(cliente.primera_cita_fecha)} />
          </div>

          {cliente.notas && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Notas</p>
              <p className="text-sm whitespace-pre-wrap">{cliente.notas}</p>
            </div>
          )}
        </div>

        {/* KPIs lado derecho */}
        <div className="space-y-3">
          <div className="card text-center">
            <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">LTV total</p>
            <p className="text-3xl font-bold text-[var(--primary-dark)]">{fmtMxn(Number(cliente.total_gastado_mxn))}</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{cliente.total_citas} citas completadas</p>
          </div>
          <div className="card text-center">
            <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Última cita</p>
            <p className="text-lg font-semibold">{fmtDate(cliente.ultima_cita_fecha)}</p>
            {cliente.ultima_cita_fecha && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                hace {Math.floor((Date.now() - new Date(cliente.ultima_cita_fecha).getTime()) / 86400000)} días
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Alertas de retoque pendientes */}
      {(retoque60dVencido || retoqueAnualVencido || retoque60d || retoqueAnual) && (
        <section className="mb-8">
          <h2 className="text-lg mb-3">Retoques calculados automáticamente</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {retoque60dVencido && (
              <Alert
                variant="warning"
                title="Retoque 60d VENCIDO"
                detail={`${retoque60dVencido.servicio?.nombre} del ${fmtDate(retoque60dVencido.fecha_realizacion)} → debió retocar el ${fmtDate(retoque60dVencido.proximo_retoque_60d_fecha)}`}
              />
            )}
            {retoqueAnualVencido && (
              <Alert
                variant="warning"
                title="Retoque anual VENCIDO"
                detail={`${retoqueAnualVencido.servicio?.nombre} → debió retocar anual el ${fmtDate(retoqueAnualVencido.proximo_retoque_anual_fecha)}`}
              />
            )}
            {retoque60d && !retoque60dVencido && (
              <Alert
                variant="info"
                title="Próximo retoque 60d"
                detail={`Programado para ${fmtDate(retoque60d.proximo_retoque_60d_fecha)}`}
              />
            )}
            {retoqueAnual && !retoqueAnualVencido && (
              <Alert
                variant="info"
                title="Próximo retoque anual"
                detail={`Programado para ${fmtDate(retoqueAnual.proximo_retoque_anual_fecha)}`}
              />
            )}
          </div>
        </section>
      )}

      {/* Historial de citas */}
      <section className="mb-8">
        <h2 className="text-lg mb-3">Historial de citas ({citas.length})</h2>
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                  <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2.5 font-medium">Servicio</th>
                  <th className="text-left px-3 py-2.5 font-medium">Estado</th>
                  <th className="text-right px-4 py-2.5 font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {citas.slice(0, 50).map((c) => {
                  const est = ESTADO_LABELS[c.estado] ?? { label: c.estado, color: "" };
                  return (
                    <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5 text-sm whitespace-nowrap">{fmtDateTime(c.inicio)}</td>
                      <td className="px-3 py-2.5 text-sm">{c.servicio?.nombre}</td>
                      <td className={`px-3 py-2.5 text-sm font-medium ${est.color}`}>{est.label}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono">{fmtMxn(Number(c.precio_mxn))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {citas.length === 0 && (
            <div className="px-4 py-8 text-center text-[var(--muted-foreground)] text-sm">Sin citas registradas aún</div>
          )}
          {citas.length > 50 && (
            <div className="px-4 py-2 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] text-center">
              Mostrando 50 más recientes de {citas.length}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Datapoint({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Alert({ variant, title, detail }: { variant: "warning" | "info"; title: string; detail: string }) {
  const colors = variant === "warning"
    ? "border-[var(--warning)] bg-[hsl(35_90%_55%_/_0.08)]"
    : "border-[var(--primary)] bg-[var(--secondary)]/15";
  const Icon = variant === "warning" ? AlertTriangle : Heart;
  const iconColor = variant === "warning" ? "text-[var(--warning)]" : "text-[var(--primary-dark)]";
  return (
    <div className={`rounded-2xl border-l-4 p-4 ${colors}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
        <div>
          <p className="font-semibold text-sm mb-1">{title}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{detail}</p>
        </div>
      </div>
    </div>
  );
}
