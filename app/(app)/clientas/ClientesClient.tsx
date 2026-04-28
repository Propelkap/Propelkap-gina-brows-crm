"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, Heart, Star, AlertCircle } from "lucide-react";

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  whatsapp: string | null;
  email: string | null;
  estado: string;
  total_citas: number;
  total_gastado_mxn: number | null;
  ultima_cita_fecha: string | null;
  proxima_cita_fecha: string | null;
};

const fmtMxn = (n: number | null) =>
  n
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n)
    : "$0";

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });
};

const ESTADOS = [
  { id: "todas", label: "Todas", icon: Users },
  { id: "activa", label: "Activas", icon: Heart },
  { id: "dormida", label: "Dormidas", icon: AlertCircle },
  { id: "vip", label: "VIP", icon: Star },
  { id: "lead", label: "Leads", icon: Users },
];

const ESTADO_BADGES: Record<string, string> = {
  activa: "bg-[var(--sage-light)] text-[var(--sage-deep)]",
  dormida: "bg-[hsl(35_90%_55%_/_0.15)] text-[var(--warning)]",
  lead: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  vip: "bg-[var(--secondary)]/40 text-[var(--primary-dark)]",
  perdida: "bg-[hsl(0_84%_60%_/_0.1)] text-[var(--destructive)]",
};

export default function ClientesClient({ clientes }: { clientes: Cliente[] }) {
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todas");

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: clientes.length };
    for (const cl of clientes) c[cl.estado] = (c[cl.estado] ?? 0) + 1;
    return c;
  }, [clientes]);

  const filtradas = useMemo(() => {
    let result = filtro === "todas" ? clientes : clientes.filter((c) => c.estado === filtro);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const full = `${c.nombre} ${c.apellido ?? ""}`.toLowerCase();
        return full.includes(q) || (c.whatsapp ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q);
      });
    }
    return result;
  }, [clientes, search, filtro]);

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <p className="eyebrow">Tu base completa</p>
        <h1 className="text-3xl mt-1">Clientas</h1>
      </header>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="!pl-11"
          autoFocus
        />
      </div>

      {/* Filtros pill */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ESTADOS.map((e) => {
          const isActive = filtro === e.id;
          const count = counts[e.id] ?? 0;
          return (
            <button
              key={e.id}
              onClick={() => setFiltro(e.id)}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                isActive
                  ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--primary)]"
                  : "bg-white text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"
              }`}
            >
              <e.icon className="w-3.5 h-3.5" />
              {e.label}
              <span className="text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Tabla */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="text-left px-5 py-3 font-medium">Clienta</th>
                <th className="text-left px-3 py-3 font-medium">WhatsApp</th>
                <th className="text-left px-3 py-3 font-medium">Estado</th>
                <th className="text-right px-3 py-3 font-medium">Citas</th>
                <th className="text-right px-3 py-3 font-medium">Gastado</th>
                <th className="text-left px-3 py-3 font-medium">Última</th>
                <th className="text-left px-5 py-3 font-medium">Próxima</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 200).map((c) => (
                <tr key={c.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/clientas/${c.id}`} className="block">
                      <div className="font-medium text-[var(--foreground)]">{c.nombre} {c.apellido}</div>
                      {c.email && <div className="text-xs text-[var(--muted-foreground)]">{c.email}</div>}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm font-mono text-[var(--muted-foreground)]">{c.whatsapp ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGES[c.estado] ?? "bg-[var(--muted)]"}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-sm">{c.total_citas}</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold">{fmtMxn(Number(c.total_gastado_mxn))}</td>
                  <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">{fmtDate(c.ultima_cita_fecha)}</td>
                  <td className="px-5 py-3 text-sm">
                    {c.proxima_cita_fecha ? (
                      <span className="text-[var(--sage-deep)] font-medium">{fmtDate(c.proxima_cita_fecha)}</span>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtradas.length === 0 && (
          <div className="px-5 py-12 text-center text-[var(--muted-foreground)]">
            No hay clientas que coincidan con tu búsqueda.
          </div>
        )}
        {filtradas.length > 200 && (
          <div className="px-5 py-3 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] text-center">
            Mostrando primeras 200 de {filtradas.length}. Refina la búsqueda.
          </div>
        )}
      </div>
    </div>
  );
}
