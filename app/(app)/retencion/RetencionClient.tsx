"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Cake, RotateCcw, Calendar, Send, MessageCircle, Sparkles, Check } from "lucide-react";
import CampaignWizard from "./CampaignWizard";

type Cliente = {
  id?: string;
  cliente_id?: string;
  cliente_nombre?: string;
  nombre?: string;
  apellido?: string;
  whatsapp?: string;
  cliente_whatsapp?: string;
  total_gastado_mxn?: number | null;
  dias_dormida?: number;
  ultima_cita_fecha?: string;
  fecha_realizacion?: string;
  proximo_retoque_60d_fecha?: string;
  proximo_retoque_anual_fecha?: string;
  servicio_original?: string;
  dias_restantes?: number;
  urgencia?: string;
  proximo_cumple?: string;
  fecha_nacimiento?: string;
  ofrecer_servicio?: string;
  compro_servicio?: string;
  ofrecer_precio?: number;
  proxima_oferta_fecha?: string;
};

const fmtMxn = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n))
    : "$0";

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—";

const TABS = [
  { id: "dormidas", label: "Dormidas", icon: Heart, accent: "primary" },
  { id: "retoques-60d", label: "Retoque 60d", icon: RotateCcw, accent: "warning" },
  { id: "retoques-anuales", label: "Retoque anual", icon: Calendar, accent: "warning" },
  { id: "cumples", label: "Cumpleaños", icon: Cake, accent: "sage" },
  { id: "cross-sell", label: "Cross-sell", icon: Sparkles, accent: "primary" },
];

type Segmento = {
  segmento: string;
  total: number;
  elegibles: number;
  elegibles_con_wa: number;
  dias_promedio: number | null;
};

export default function RetencionClient({
  tab,
  dormidas,
  retoques60,
  retoquesAnuales,
  cumples,
  crossSell,
  segmentos = [],
}: {
  tab: string;
  dormidas: Cliente[];
  retoques60: Cliente[];
  retoquesAnuales: Cliente[];
  cumples: Cliente[];
  crossSell: Cliente[];
  segmentos?: Segmento[];
}) {
  const [activeTab, setActiveTab] = useState(tab || "dormidas");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);

  const counts = {
    dormidas: dormidas.length,
    "retoques-60d": retoques60.length,
    "retoques-anuales": retoquesAnuales.length,
    cumples: cumples.length,
    "cross-sell": crossSell.length,
  };

  const datasets = { dormidas, "retoques-60d": retoques60, "retoques-anuales": retoquesAnuales, cumples, "cross-sell": crossSell };
  const data = datasets[activeTab as keyof typeof datasets] ?? [];

  const toggleAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.map((c) => c.id ?? c.cliente_id ?? "").filter(Boolean)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const switchTab = (newTab: string) => {
    setActiveTab(newTab);
    setSelected(new Set());
  };

  const valorPotencial = useMemo(() => {
    if (activeTab === "retoques-anuales") return data.length * 2200;
    if (activeTab === "retoques-60d") return data.length * 1500;
    if (activeTab === "dormidas") {
      const ticket = 1605;
      return Math.round(data.length * 0.05) * ticket; // 5% reactivación conservador
    }
    if (activeTab === "cross-sell") {
      return data.reduce((s, c) => s + Number(c.ofrecer_precio ?? 0), 0);
    }
    return 0;
  }, [activeTab, data]);

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <p className="eyebrow">Retención + reactivación</p>
        <h1 className="text-3xl mt-1">Tu base, lista para activarse</h1>
      </header>

      {/* Dashboard de segmentos de cartera (caliente / tibia / fría / dormida) */}
      {segmentos.length > 0 && (
        <section className="mb-6">
          <p className="eyebrow !text-[var(--primary-dark)] mb-2">Cartera por segmento</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {segmentos
              .filter((s) => s.segmento !== "archivada")
              .map((s) => {
                const labels: Record<string, { titulo: string; sub: string; emoji: string; color: string }> = {
                  caliente: { titulo: "Caliente", sub: "Cita reciente o futura", emoji: "🔥", color: "var(--destructive)" },
                  reciente_30_60: { titulo: "Reciente", sub: "30-60 días", emoji: "✨", color: "var(--sage-deep)" },
                  tibia_60_180: { titulo: "Tibia", sub: "60-180 días", emoji: "☕", color: "var(--warning)" },
                  fria_180_365: { titulo: "Fría", sub: "180-365 días", emoji: "❄️", color: "var(--primary-dark)" },
                  dormida_365_plus: { titulo: "Dormida", sub: "365+ días", emoji: "💤", color: "var(--muted-foreground)" },
                };
                const meta = labels[s.segmento] ?? { titulo: s.segmento, sub: "", emoji: "·", color: "var(--muted-foreground)" };
                return (
                  <div
                    key={s.segmento}
                    className="card text-center"
                    style={{ borderTop: `3px solid ${meta.color}` }}
                  >
                    <div className="text-xl mb-1">{meta.emoji}</div>
                    <div className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium">
                      {meta.titulo}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)] mb-1">{meta.sub}</div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{s.total}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                      {s.elegibles_con_wa} con WhatsApp
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          const count = counts[t.id as keyof typeof counts];
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                isActive
                  ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--primary)]"
                  : "bg-white text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              <span className={`text-xs px-1.5 rounded-full ${isActive ? "bg-white/60" : "bg-[var(--muted)]"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Hero del valor potencial */}
      {valorPotencial > 0 && (
        <div className="bg-[var(--foreground)] text-[var(--background)] rounded-2xl p-6 mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="eyebrow !text-[var(--secondary)] mb-1">Valor potencial</p>
            <p className="text-3xl font-bold text-[var(--background)]">{fmtMxn(valorPotencial)}</p>
            <p className="text-xs opacity-70 mt-1">
              {activeTab === "dormidas" && "Asumiendo 5% reactivación × ticket promedio"}
              {activeTab === "retoques-anuales" && `${data.length} clientas × $2,200`}
              {activeTab === "retoques-60d" && `${data.length} clientas × $1,500`}
              {activeTab === "cross-sell" && "Precio total de servicios sugeridos"}
            </p>
          </div>
          {data.length > 0 && (
            <button
              onClick={() => {
                if (selected.size === 0) toggleAll();
                setShowWizard(true);
              }}
              className="inline-flex items-center gap-2 bg-[var(--secondary)] text-[var(--foreground)] px-6 py-3 rounded-full font-semibold hover:bg-[var(--primary)] transition-colors"
            >
              <Send className="w-4 h-4" />
              Crear campaña ({selected.size > 0 ? `${selected.size} seleccionadas` : "todas"})
            </button>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="card !p-0 overflow-hidden">
        {data.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Sparkles className="w-8 h-8 text-[var(--sage)] mx-auto mb-3 opacity-50" />
            <p className="text-[var(--muted-foreground)]">
              {activeTab === "cross-sell"
                ? "El cross-sell se calcula 90 días después de cada microblading. Pronto verás sugerencias automáticas conforme tus clientas regresen."
                : "Sin pendientes en este tab. ¡Bien hecho!"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === data.length && data.length > 0}
                      onChange={toggleAll}
                      className="!w-4 !h-4 accent-[var(--primary-dark)]"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-medium">Clienta</th>
                  <th className="text-left px-3 py-3 font-medium">WhatsApp</th>
                  {activeTab === "dormidas" && (
                    <>
                      <th className="text-right px-3 py-3 font-medium">Días dormida</th>
                      <th className="text-right px-3 py-3 font-medium">LTV</th>
                    </>
                  )}
                  {(activeTab === "retoques-60d" || activeTab === "retoques-anuales") && (
                    <>
                      <th className="text-left px-3 py-3 font-medium">Servicio original</th>
                      <th className="text-right px-3 py-3 font-medium">Días</th>
                      <th className="text-left px-3 py-3 font-medium">Urgencia</th>
                    </>
                  )}
                  {activeTab === "cumples" && (
                    <th className="text-left px-3 py-3 font-medium">Cumple</th>
                  )}
                  {activeTab === "cross-sell" && (
                    <>
                      <th className="text-left px-3 py-3 font-medium">Compró</th>
                      <th className="text-left px-3 py-3 font-medium">Ofrecer</th>
                      <th className="text-right px-3 py-3 font-medium">Precio</th>
                    </>
                  )}
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const id = c.id ?? c.cliente_id ?? "";
                  const nombre = c.cliente_nombre ?? `${c.nombre ?? ""} ${c.apellido ?? ""}`.trim();
                  const wa = c.cliente_whatsapp ?? c.whatsapp ?? "";
                  return (
                    <tr key={id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleOne(id)}
                          className="!w-4 !h-4 accent-[var(--primary-dark)]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/clientas/${id}`} className="font-medium hover:underline">{nombre}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono text-[var(--muted-foreground)]">{wa}</td>
                      {activeTab === "dormidas" && (
                        <>
                          <td className="px-3 py-2.5 text-sm text-right">{c.dias_dormida}</td>
                          <td className="px-3 py-2.5 text-sm text-right font-semibold">{fmtMxn(Number(c.total_gastado_mxn))}</td>
                        </>
                      )}
                      {(activeTab === "retoques-60d" || activeTab === "retoques-anuales") && (
                        <>
                          <td className="px-3 py-2.5 text-sm">{c.servicio_original}</td>
                          <td className="px-3 py-2.5 text-sm text-right">
                            {c.dias_restantes !== undefined && c.dias_restantes < 0
                              ? <span className="text-[var(--destructive)]">{c.dias_restantes}d</span>
                              : `+${c.dias_restantes}d`}
                          </td>
                          <td className="px-3 py-2.5 text-sm">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.urgencia === "vencido" ? "bg-[hsl(0_84%_60%_/_0.1)] text-[var(--destructive)]" :
                              c.urgencia === "urgente" ? "bg-[hsl(35_90%_55%_/_0.15)] text-[var(--warning)]" :
                              "bg-[var(--sage-light)] text-[var(--sage-deep)]"
                            }`}>
                              {c.urgencia}
                            </span>
                          </td>
                        </>
                      )}
                      {activeTab === "cumples" && (
                        <td className="px-3 py-2.5 text-sm font-semibold text-[var(--primary-dark)]">{fmtDate(c.proximo_cumple)}</td>
                      )}
                      {activeTab === "cross-sell" && (
                        <>
                          <td className="px-3 py-2.5 text-sm">{c.compro_servicio}</td>
                          <td className="px-3 py-2.5 text-sm font-medium text-[var(--primary-dark)]">{c.ofrecer_servicio}</td>
                          <td className="px-3 py-2.5 text-sm text-right font-semibold">{fmtMxn(Number(c.ofrecer_precio))}</td>
                        </>
                      )}
                      <td className="px-3 py-2.5">
                        {wa && (
                          <a
                            href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Hello, hello 🌿 ")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--primary-dark)] hover:text-[var(--foreground)]"
                            title="WhatsApp directo"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Wizard de campaña */}
      {showWizard && (
        <CampaignWizard
          onClose={() => setShowWizard(false)}
          recipients={data.filter((c) => selected.has(c.id ?? c.cliente_id ?? "")).map((c) => ({
            id: c.id ?? c.cliente_id ?? "",
            nombre: c.cliente_nombre ?? `${c.nombre ?? ""} ${c.apellido ?? ""}`.trim(),
            whatsapp: c.cliente_whatsapp ?? c.whatsapp ?? "",
          }))}
          tipo={activeTab}
        />
      )}
    </div>
  );
}
