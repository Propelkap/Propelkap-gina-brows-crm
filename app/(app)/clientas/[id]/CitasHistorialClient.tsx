"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import CitaActions from "../../_components/CitaActions";
import CheckoutCita from "../../_components/CheckoutCita";

type Cita = {
  id: string;
  inicio: string;
  estado: string;
  precio_mxn: number;
  anticipo_mxn?: number;
  notas_internas?: string | null;
  sesion_numero?: number | null;
  sesiones_totales?: number | null;
  servicio?: { nombre: string; categoria?: string } | null;
};

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  completada: { label: "Completada", color: "text-[var(--success)]" },
  no_show: { label: "No asistió", color: "text-[var(--destructive)]" },
  cancelada: { label: "Cancelada", color: "text-[var(--muted-foreground)]" },
  confirmada: { label: "Confirmada", color: "text-[var(--sage-deep)]" },
  tentativa: { label: "Pendiente", color: "text-[var(--warning)]" },
  reagendada: { label: "Reagendada", color: "text-[var(--muted-foreground)]" },
};

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export default function CitasHistorialClient({ citas, clienteWhatsapp }: { citas: Cita[]; clienteWhatsapp: string | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
            <th className="w-8"></th>
            <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
            <th className="text-left px-3 py-2.5 font-medium">Servicio</th>
            <th className="text-left px-3 py-2.5 font-medium">Estado</th>
            <th className="text-right px-4 py-2.5 font-medium">Precio</th>
          </tr>
        </thead>
        <tbody>
          {citas.slice(0, 50).map((c) => {
            const est = ESTADO_LABELS[c.estado] ?? { label: c.estado, color: "" };
            const esFutura = new Date(c.inicio) > new Date();
            const isExpanded = expanded.has(c.id);
            return (
              <>
                <tr
                  key={c.id}
                  className="border-b border-[var(--border)] last:border-0 align-top hover:bg-[var(--muted)]/40 cursor-pointer"
                  onClick={() => toggle(c.id)}
                >
                  <td className="px-2 py-2.5">
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)]" />}
                  </td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">{fmtDateTime(c.inicio)}</td>
                  <td className="px-3 py-2.5 text-sm">
                    {c.servicio?.nombre}
                    {c.sesion_numero && c.sesiones_totales && (
                      <span className="text-[var(--muted-foreground)]"> ({c.sesion_numero}/{c.sesiones_totales})</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-sm font-medium ${est.color}`}>
                    {est.label}
                    {esFutura && c.estado !== "completada" && c.estado !== "cancelada" && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <CitaActions citaId={c.id} estadoActual={c.estado} precioMxn={Number(c.precio_mxn)} clienteWhatsapp={clienteWhatsapp} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right font-mono">{fmtMxn(Number(c.precio_mxn))}</td>
                </tr>
                {isExpanded && (
                  <tr key={`${c.id}-exp`} className="bg-[var(--background)]">
                    <td colSpan={5} className="px-6 py-3">
                      <CheckoutCita citaId={c.id} precioServicio={Number(c.precio_mxn)} anticipo={c.anticipo_mxn} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
