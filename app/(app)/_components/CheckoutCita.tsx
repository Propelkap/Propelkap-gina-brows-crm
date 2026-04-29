"use client";

/**
 * Check-out: agregar servicios/productos extras consumidos en la cita.
 * Se usa en el drawer del calendario y en la ficha del cliente.
 * Muestra: items + total de items + total final (servicio + items - anticipo)
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, ShoppingBag, Package, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Servicio = { id: string; nombre: string; precio_mxn: number; categoria: string | null };
type Item = {
  id: string;
  servicio_id: string | null;
  descripcion_libre: string | null;
  cantidad: number;
  precio_unitario_mxn: number;
  precio_total_mxn: number;
  notas: string | null;
  servicio?: { nombre: string; categoria: string } | null;
};

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

export default function CheckoutCita({
  citaId, precioServicio, anticipo,
}: {
  citaId: string;
  precioServicio: number;
  anticipo?: number;
}) {
  const sb = createClient();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form de agregar item
  const [modo, setModo] = useState<"servicio" | "libre">("servicio");
  const [selectedServicio, setSelectedServicio] = useState<string>("");
  const [descripcionLibre, setDescripcionLibre] = useState("");
  const [precio, setPrecio] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    cargar();
    sb.from("servicios").select("id, nombre, precio_mxn, categoria").eq("visible", true).order("orden")
      .then(({ data }) => setServicios(data ?? []));
  }, [citaId]);

  async function cargar() {
    setLoading(true);
    const res = await fetch(`/api/citas/${citaId}/items`);
    const j = await res.json();
    setItems(j.items ?? []);
    setLoading(false);
  }

  function selectServ(id: string) {
    setSelectedServicio(id);
    const s = servicios.find((x) => x.id === id);
    if (s) setPrecio(String(s.precio_mxn));
  }

  async function agregar() {
    setError(null);
    const payload: Record<string, unknown> = {
      cantidad: parseFloat(cantidad || "1"),
      precio_unitario_mxn: parseFloat(precio || "0"),
    };
    if (modo === "servicio") {
      if (!selectedServicio) { setError("Selecciona un servicio"); return; }
      payload.servicio_id = selectedServicio;
    } else {
      if (!descripcionLibre.trim()) { setError("Pon descripción del producto"); return; }
      payload.descripcion_libre = descripcionLibre.trim();
    }
    if (!payload.precio_unitario_mxn || (payload.precio_unitario_mxn as number) < 0) {
      setError("Pon el precio");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/citas/${citaId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(j.error || "Error al agregar");
      return;
    }
    setItems([...items, j.item]);
    // Reset
    setSelectedServicio("");
    setDescripcionLibre("");
    setPrecio("");
    setCantidad("1");
    setShowAdd(false);
  }

  async function eliminar(itemId: string) {
    if (!confirm("¿Eliminar este item?")) return;
    const res = await fetch(`/api/citas/${citaId}/items/${itemId}`, { method: "DELETE" });
    if (res.ok) setItems(items.filter((i) => i.id !== itemId));
  }

  const totalItems = items.reduce((s, i) => s + Number(i.precio_total_mxn), 0);
  const totalFinal = precioServicio + totalItems;
  const saldo = totalFinal - (anticipo ?? 0);

  return (
    <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)] mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow !text-[var(--primary-dark)]">Check-out · Items consumidos</p>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} className="btn-ghost !text-xs !py-1">
            <Plus className="w-3 h-3" /> Agregar
          </button>
        )}
      </div>

      {loading && <p className="text-xs text-[var(--muted-foreground)]">Cargando…</p>}

      {!loading && items.length === 0 && !showAdd && (
        <p className="text-xs text-[var(--muted-foreground)] italic">
          Sin items extras. Agrega lo que la clienta consumió además del servicio principal.
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-1 mb-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[var(--border)] last:border-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {it.servicio_id ? <ShoppingBag className="w-3 h-3 text-[var(--sage-deep)] shrink-0" /> : <Package className="w-3 h-3 text-[var(--primary-dark)] shrink-0" />}
                <span className="truncate">
                  {it.servicio?.nombre ?? it.descripcion_libre}
                  {Number(it.cantidad) !== 1 && ` ×${it.cantidad}`}
                </span>
              </div>
              <span className="font-mono font-semibold shrink-0">{fmtMxn(Number(it.precio_total_mxn))}</span>
              <button onClick={() => eliminar(it.id)} className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-3 space-y-2 bg-[var(--background)] p-3 rounded-lg border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Nuevo item</p>
            <button onClick={() => setShowAdd(false)} className="p-1 text-[var(--muted-foreground)]"><X className="w-3 h-3" /></button>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setModo("servicio")}
              className={`flex-1 py-1.5 rounded-lg border text-xs ${modo === "servicio" ? "bg-[var(--secondary)] border-[var(--primary)]" : "border-[var(--border)] bg-white"}`}
            >Del catálogo</button>
            <button
              onClick={() => setModo("libre")}
              className={`flex-1 py-1.5 rounded-lg border text-xs ${modo === "libre" ? "bg-[var(--secondary)] border-[var(--primary)]" : "border-[var(--border)] bg-white"}`}
            >Producto/otro</button>
          </div>

          {modo === "servicio" ? (
            <select value={selectedServicio} onChange={(e) => selectServ(e.target.value)} className="!text-xs !py-1.5">
              <option value="">— Selecciona —</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {fmtMxn(Number(s.precio_mxn))}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={descripcionLibre}
              onChange={(e) => setDescripcionLibre(e.target.value)}
              placeholder="Ej: TOCOBO azul, Sombreado adicional..."
              className="!text-xs !py-1.5"
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="Cantidad"
              className="!text-xs !py-1.5"
              min="1"
              step="0.5"
            />
            <input
              type="number"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Precio MXN"
              className="!text-xs !py-1.5"
            />
          </div>

          {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}

          <button onClick={agregar} disabled={saving} className="btn-primary w-full justify-center !text-xs !py-1.5">
            {saving ? "Guardando…" : "+ Agregar al check-out"}
          </button>
        </div>
      )}

      {/* Totales */}
      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1 text-xs">
          <div className="flex justify-between text-[var(--muted-foreground)]">
            <span>Servicio principal</span>
            <span className="font-mono">{fmtMxn(precioServicio)}</span>
          </div>
          <div className="flex justify-between text-[var(--muted-foreground)]">
            <span>+ {items.length} item{items.length !== 1 ? "s" : ""} extra</span>
            <span className="font-mono">{fmtMxn(totalItems)}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-[var(--foreground)]">
            <span>Total final</span>
            <span className="font-mono">{fmtMxn(totalFinal)}</span>
          </div>
          {(anticipo ?? 0) > 0 && (
            <div className="flex justify-between text-[var(--sage-deep)]">
              <span>Anticipo cobrado</span>
              <span className="font-mono">−{fmtMxn(anticipo!)}</span>
            </div>
          )}
          {(anticipo ?? 0) > 0 && (
            <div className="flex justify-between font-bold text-[var(--primary-dark)]">
              <span>Saldo a cobrar</span>
              <span className="font-mono">{fmtMxn(saldo)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
