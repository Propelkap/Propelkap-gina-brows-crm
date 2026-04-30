"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Calendar, User, Sparkles, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Cliente = { id: string; nombre: string; apellido: string | null; whatsapp: string | null };
type Servicio = { id: string; nombre: string; precio_mxn: number; duracion_min: number; sesiones_paquete?: number };
type SesionInfo = { sesion_numero: number; sesiones_totales: number; precio_mxn: number; es_paquete: boolean };

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

/** YMD en TZ local (no UTC). Evita el shift al dia siguiente cuando son las
 *  noches en MX (UTC-6) y toISOString() salta de dia. */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** HH:MM en hora local. */
function localHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function NuevaCitaModal({ onClose, clientePreseleccionado, fechaInicial }: { onClose: () => void; clientePreseleccionado?: Cliente; fechaInicial?: Date | null }) {
  const router = useRouter();
  const sb = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [search, setSearch] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(clientePreseleccionado ?? null);
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [fecha, setFecha] = useState(() => fechaInicial ? localYmd(fechaInicial) : "");
  const [hora, setHora] = useState(() => fechaInicial ? localHm(fechaInicial) : "");
  const [precio, setPrecio] = useState<string>("");
  const [anticipo, setAnticipo] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sesionInfo, setSesionInfo] = useState<SesionInfo | null>(null);

  useEffect(() => {
    sb.from("servicios").select("id, nombre, precio_mxn, duracion_min, sesiones_paquete").eq("visible", true).order("orden").then(({ data }) => setServicios(data ?? []));
    if (!clientePreseleccionado) {
      sb.from("clientes").select("id, nombre, apellido, whatsapp").eq("archivada", false).limit(500).then(({ data }) => setClientes(data ?? []));
    }
  }, []);

  // Cuando hay cliente + servicio paquete, consultar RPC para saber qué sesión sería y a qué precio
  useEffect(() => {
    if (!servicio || !cliente) {
      setSesionInfo(null);
      if (servicio) setPrecio(String(servicio.precio_mxn));
      return;
    }
    if ((servicio.sesiones_paquete ?? 1) <= 1) {
      setSesionInfo(null);
      setPrecio(String(servicio.precio_mxn));
      return;
    }
    // Es paquete: consultar el RPC
    sb.rpc("calcular_proxima_sesion_paquete", {
      p_cliente_id: cliente.id,
      p_servicio_id: servicio.id,
    }).then(({ data }) => {
      if (data && data.length > 0) {
        const r = data[0] as SesionInfo;
        setSesionInfo(r);
        setPrecio(String(r.precio_mxn));
      }
    });
  }, [servicio, cliente]);

  const filtrados = useMemo(() => {
    if (!search.trim()) return clientes.slice(0, 8);
    const q = search.toLowerCase();
    return clientes
      .filter((c) => `${c.nombre} ${c.apellido ?? ""}`.toLowerCase().includes(q) || (c.whatsapp ?? "").includes(q))
      .slice(0, 8);
  }, [clientes, search]);

  const finCalculado = useMemo(() => {
    if (!fecha || !hora || !servicio) return null;
    const inicio = new Date(`${fecha}T${hora}:00`);
    const fin = new Date(inicio.getTime() + servicio.duracion_min * 60_000);
    return fin.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }, [fecha, hora, servicio]);

  async function submit() {
    if (!cliente || !servicio || !fecha || !hora) {
      setError("Completa cliente, servicio y fecha/hora");
      return;
    }
    setSubmitting(true);
    setError(null);
    const inicio = new Date(`${fecha}T${hora}:00`).toISOString();
    const res = await fetch("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_id: cliente.id,
        servicio_id: servicio.id,
        inicio,
        precio_mxn: parseFloat(precio || "0"),
        anticipo_mxn: parseFloat(anticipo || "0"),
        notas_internas: notas || null,
      }),
    });
    const j = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(j.error || "Error al crear cita");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.6)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--background)] rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--background)] z-10">
          <div>
            <p className="eyebrow !text-[var(--primary-dark)] mb-0.5">Nueva cita</p>
            <h2 className="text-xl">Agendar</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Cliente */}
          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block flex items-center gap-2">
              <User className="w-3 h-3" /> Clienta
            </label>
            {cliente ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--secondary)]/30 border border-[var(--primary)]">
                <div>
                  <p className="font-medium">{cliente.nombre} {cliente.apellido}</p>
                  <p className="text-xs text-[var(--muted-foreground)] font-mono">{cliente.whatsapp}</p>
                </div>
                {!clientePreseleccionado && (
                  <button onClick={() => setCliente(null)} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">Cambiar</button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o teléfono…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="!pl-10"
                    autoFocus
                  />
                </div>
                {filtrados.length > 0 && (
                  <div className="mt-2 border border-[var(--border)] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    {filtrados.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setCliente(c); setSearch(""); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[var(--muted)] border-b border-[var(--border)] last:border-0 text-sm"
                      >
                        <div className="font-medium">{c.nombre} {c.apellido}</div>
                        <div className="text-xs text-[var(--muted-foreground)] font-mono">{c.whatsapp}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Servicio */}
          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> Servicio
            </label>
            <select
              value={servicio?.id ?? ""}
              onChange={(e) => setServicio(servicios.find((s) => s.id === e.target.value) ?? null)}
            >
              <option value="">— Selecciona un servicio —</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {fmtMxn(Number(s.precio_mxn))} · {s.duracion_min} min{(s.sesiones_paquete ?? 1) > 1 ? ` · paquete ${s.sesiones_paquete} sesiones` : ""}
                </option>
              ))}
            </select>
            {sesionInfo && sesionInfo.es_paquete && (
              <div className="mt-2 bg-[var(--secondary)]/15 border border-[var(--primary)] rounded-lg p-3 text-sm">
                <p className="font-semibold text-[var(--primary-dark)]">
                  Sesión {sesionInfo.sesion_numero}/{sesionInfo.sesiones_totales} del paquete
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  {sesionInfo.sesion_numero === 1
                    ? `Esta es la primera sesión: se cobra el paquete completo de ${fmtMxn(sesionInfo.precio_mxn)}.`
                    : `El paquete ya fue cobrado en la sesión 1. Esta sesión queda en $0.`}
                </p>
              </div>
            )}
          </div>

          {/* Fecha y hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Fecha
              </label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} min={localYmd(new Date())} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block">Hora</label>
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              {finCalculado && <p className="text-xs text-[var(--sage-deep)] mt-1">Termina ≈ {finCalculado}</p>}
            </div>
          </div>

          {/* Precio + anticipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block">Precio MXN</label>
              <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block">Anticipo MXN</label>
              <input type="number" value={anticipo} onChange={(e) => setAnticipo(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block">Notas internas (opcional)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Cualquier cosa que debas recordar de esta cita…" />
          </div>

          {error && <div className="bg-[hsl(0_84%_60%_/_0.1)] border border-[var(--destructive)] rounded-xl p-3 text-sm text-[var(--destructive)]">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancelar</button>
            <button onClick={submit} disabled={submitting || !cliente || !servicio || !fecha || !hora} className="btn-primary flex-1 justify-center">
              {submitting ? "Creando…" : "Agendar cita"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
