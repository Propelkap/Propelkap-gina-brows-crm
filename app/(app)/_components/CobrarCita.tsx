"use client";

/**
 * Cobro de la cita estilo AgendaPro:
 *  - Resumen de saldo (total / pagado / saldo) calculado por v_citas_saldo
 *  - Grid de metodos de pago (efectivo, terminal, tarjetas, transferencia, giftcard)
 *  - Soporta multiples pagos parciales (abonos): cada click registra UN pago
 *    y va reduciendo el saldo. Si saldo>0 sigue cobrable.
 *  - Lista de pagos registrados con opcion de eliminar.
 *  - "Enviar link de pago": stub hasta que se active Stripe en producccion.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Banknote, CreditCard, Receipt, ArrowLeftRight, Gift, Send,
  Trash2, CheckCircle2, Clock, Wallet, AlertCircle,
} from "lucide-react";

type Metodo =
  | "efectivo" | "terminal" | "tarjeta_credito" | "tarjeta_debito"
  | "transferencia" | "giftcard" | "link_pago" | "stripe" | "otro";

type Pago = {
  id: string;
  monto_mxn: number;
  metodo: Metodo;
  estado: string;
  referencia: string | null;
  notas: string | null;
  pagado_at: string | null;
  created_at: string;
};

type Saldo = {
  precio_servicio_mxn: number;
  total_items_mxn: number;
  anticipo_mxn: number;
  total_mxn: number;
  total_pagado_mxn: number;
  saldo_mxn: number;
  num_pagos: number;
  estado_pago: "pendiente" | "parcial" | "pagado";
};

const METODOS: { id: Metodo; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "efectivo",        label: "Efectivo",        icon: <Banknote className="w-5 h-5" />,        color: "var(--sage-deep)" },
  { id: "terminal",        label: "Terminal POS",    icon: <Receipt className="w-5 h-5" />,         color: "var(--primary-dark)" },
  { id: "tarjeta_credito", label: "T. Crédito",      icon: <CreditCard className="w-5 h-5" />,      color: "var(--primary-dark)" },
  { id: "tarjeta_debito",  label: "T. Débito",       icon: <Wallet className="w-5 h-5" />,          color: "var(--primary-dark)" },
  { id: "transferencia",   label: "Transferencia",   icon: <ArrowLeftRight className="w-5 h-5" />,  color: "var(--sage-deep)" },
  { id: "giftcard",        label: "Giftcard",        icon: <Gift className="w-5 h-5" />,            color: "var(--primary-dark)" },
];

const METODO_LABELS: Record<string, string> = {
  efectivo: "Efectivo", terminal: "Terminal", tarjeta_credito: "T. Crédito",
  tarjeta_debito: "T. Débito", transferencia: "Transferencia",
  giftcard: "Giftcard", link_pago: "Link de pago", stripe: "Stripe", otro: "Otro",
};

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

export default function CobrarCita({ citaId }: { citaId: string }) {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [selectedMetodo, setSelectedMetodo] = useState<Metodo | null>(null);
  const [monto, setMonto] = useState<string>("");
  const [referencia, setReferencia] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { cargar(); }, [citaId]);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/citas/${citaId}/pagos`, { cache: "no-store" });
      const text = await res.text();
      let j: any;
      try { j = JSON.parse(text); } catch {
        setError(`Respuesta no-JSON (status ${res.status}): ${text.slice(0, 120)}`);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(j.error || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      setPagos(j.pagos ?? []);
      setSaldo(j.saldo);
      if (j.saldo && j.saldo.saldo_mxn > 0) setMonto(String(j.saldo.saldo_mxn));
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  }

  async function registrarPago() {
    if (!selectedMetodo) { setError("Elige un método de pago"); return; }
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { setError("Pon el monto a cobrar"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/citas/${citaId}/pagos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monto_mxn: montoNum,
        metodo: selectedMetodo,
        referencia: referencia.trim() || null,
      }),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(j.error || "Error al registrar pago");
      return;
    }
    // Reset form y recarga
    setSelectedMetodo(null);
    setReferencia("");
    setMonto("");
    await cargar();
  }

  async function eliminarPago(pagoId: string) {
    if (!confirm("¿Eliminar este pago?")) return;
    const res = await fetch(`/api/citas/${citaId}/pagos/${pagoId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Error al eliminar");
      return;
    }
    await cargar();
  }

  const estadoBadge = useMemo(() => {
    if (!saldo) return null;
    if (saldo.estado_pago === "pagado") {
      return <span className="inline-flex items-center gap-1 text-[var(--sage-deep)] text-xs font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
      </span>;
    }
    if (saldo.estado_pago === "parcial") {
      return <span className="inline-flex items-center gap-1 text-[var(--warning)] text-xs font-semibold">
        <Clock className="w-3.5 h-3.5" /> Abono parcial · saldo {fmtMxn(saldo.saldo_mxn)}
      </span>;
    }
    return <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)] text-xs font-semibold">
      <Clock className="w-3.5 h-3.5" /> Pendiente de cobro
    </span>;
  }, [saldo]);

  if (loading) {
    return (
      <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)] mt-2">
        <p className="eyebrow !text-[var(--primary-dark)]">Cobro</p>
        <p className="text-xs text-[var(--muted-foreground)] py-3">Cargando pagos…</p>
      </div>
    );
  }
  if (!saldo) {
    return (
      <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--destructive)]/40 mt-2">
        <p className="eyebrow !text-[var(--destructive)]">Cobro · Error</p>
        <div className="flex items-start gap-1.5 text-xs text-[var(--destructive)] py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error || "No pude cargar el saldo de la cita."}</span>
        </div>
        <button onClick={cargar} className="btn-ghost !text-xs mt-1">Reintentar</button>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-2">
          Si el error persiste: verifica que la migration 008 se haya aplicado en Supabase
          (vista <code>v_citas_saldo</code>) y que estés logueada.
        </p>
      </div>
    );
  }

  const saldoPendiente = saldo.saldo_mxn > 0;

  return (
    <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)] mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow !text-[var(--primary-dark)]">Cobro</p>
        {estadoBadge}
      </div>

      {/* Resumen de totales */}
      <div className="bg-[var(--background)] rounded-lg p-3 mb-3 space-y-1 text-xs">
        <Row label="Servicio principal" value={fmtMxn(Number(saldo.precio_servicio_mxn))} muted />
        {Number(saldo.total_items_mxn) > 0 && (
          <Row label="Items extras" value={fmtMxn(Number(saldo.total_items_mxn))} muted />
        )}
        <div className="border-t border-[var(--border)] my-1" />
        <Row label="Total" value={fmtMxn(Number(saldo.total_mxn))} bold />
        {Number(saldo.anticipo_mxn) > 0 && (
          <Row label="Anticipo previo" value={`−${fmtMxn(Number(saldo.anticipo_mxn))}`} accent="sage" />
        )}
        {Number(saldo.total_pagado_mxn) > 0 && (
          <Row label={`Pagos registrados (${saldo.num_pagos})`} value={`−${fmtMxn(Number(saldo.total_pagado_mxn))}`} accent="sage" />
        )}
        <div className="border-t border-[var(--border)] my-1" />
        <Row
          label="Saldo a cobrar"
          value={fmtMxn(Number(saldo.saldo_mxn))}
          big
          accent={saldoPendiente ? "primary" : "sage"}
        />
      </div>

      {/* Grid de metodos de pago — solo si hay saldo */}
      {saldoPendiente && (
        <>
          <p className="text-xs font-semibold mb-2 text-[var(--foreground)]">Método de pago</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {METODOS.map((m) => {
              const sel = selectedMetodo === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMetodo(m.id)}
                  className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-lg border transition-all text-[11px] leading-tight ${
                    sel
                      ? "bg-[var(--secondary)]/40 border-[var(--primary)] ring-2 ring-[var(--primary)]/30"
                      : "bg-white border-[var(--border)] hover:border-[var(--primary)]/50"
                  }`}
                  style={{ color: sel ? "var(--primary-dark)" : m.color }}
                >
                  {m.icon}
                  <span className="font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Monto + referencia */}
          <div className="grid grid-cols-[1fr_1fr] gap-2 mb-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Monto MXN</label>
              <input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder={String(saldo.saldo_mxn)}
                className="!text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Referencia (opcional)</label>
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Últ 4 tarjeta, # transferencia…"
                className="!text-sm"
              />
            </div>
          </div>

          <p className="text-[10px] text-[var(--muted-foreground)] mb-2">
            💡 Si el monto es menor al saldo, queda como abono parcial y la cita seguirá cobrable.
          </p>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--destructive)] mb-2">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={registrarPago}
              disabled={saving || !selectedMetodo}
              className="btn-primary flex-1 justify-center !text-xs disabled:opacity-50"
            >
              {saving ? "Registrando…" : "Registrar pago"}
            </button>
            <button
              type="button"
              onClick={() => alert("Funcionalidad disponible cuando se active Stripe (próximamente). Por ahora cobra directo y registra el método aquí.")}
              className="btn-ghost !text-xs"
              title="Pendiente activación Stripe"
            >
              <Send className="w-3.5 h-3.5" /> Link
            </button>
          </div>
        </>
      )}

      {/* Pagado completo */}
      {!saldoPendiente && (
        <div className="bg-[var(--sage-light)] border border-[var(--sage-deep)]/30 rounded-lg p-3 text-center text-xs text-[var(--sage-deep)] font-semibold mb-3">
          <CheckCircle2 className="w-4 h-4 inline mr-1" /> Cobrado completo
        </div>
      )}

      {/* Lista de pagos */}
      {pagos.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-1.5">
            Pagos registrados
          </p>
          <div className="space-y-1">
            {pagos.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="px-1.5 py-0.5 rounded bg-[var(--secondary)]/30 text-[var(--primary-dark)] text-[10px] font-medium uppercase">
                    {METODO_LABELS[p.metodo] ?? p.metodo}
                  </span>
                  {p.referencia && <span className="text-[var(--muted-foreground)] truncate">{p.referencia}</span>}
                </div>
                <span className="font-mono font-semibold">{fmtMxn(Number(p.monto_mxn))}</span>
                <button
                  onClick={() => eliminarPago(p.id)}
                  className="text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                  title="Eliminar pago"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, muted, bold, big, accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  big?: boolean;
  accent?: "primary" | "sage";
}) {
  const colorCls = accent === "primary"
    ? "text-[var(--primary-dark)]"
    : accent === "sage"
    ? "text-[var(--sage-deep)]"
    : muted
    ? "text-[var(--muted-foreground)]"
    : "text-[var(--foreground)]";
  const sizeCls = big ? "text-base font-bold" : bold ? "font-semibold" : "";
  return (
    <div className={`flex justify-between items-center ${colorCls} ${sizeCls}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
