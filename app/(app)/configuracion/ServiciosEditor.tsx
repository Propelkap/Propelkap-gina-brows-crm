"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, X, Trash2, Plus, EyeOff, Eye } from "lucide-react";

type Servicio = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio_mxn: number;
  duracion_min: number;
  retoque_dias_obligatorio: number | null;
  retoque_precio_mxn: number | null;
  retoque_anual_dias: number | null;
  retoque_anual_precio_mxn: number | null;
  visible: boolean;
  orden: number;
};

const fmtMxn = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n))
    : "—";

export default function ServiciosEditor({ servicios: initial }: { servicios: Servicio[] }) {
  const router = useRouter();
  const [servicios, setServicios] = useState<Servicio[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Servicio>>({});
  const [saving, setSaving] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibles = servicios.filter((s) => s.visible || showHidden);

  function startEdit(s: Servicio) {
    setEditingId(s.id);
    setDraft({ ...s });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/servicios/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(j.error || "Error al guardar");
      return;
    }
    setServicios((prev) => prev.map((s) => (s.id === editingId ? j.servicio : s)));
    setEditingId(null);
    setDraft({});
    router.refresh();
  }

  async function archivar(id: string) {
    if (!confirm("¿Ocultar este servicio del catálogo? (Las citas históricas no se afectan)")) return;
    const res = await fetch(`/api/servicios/${id}`, { method: "DELETE" });
    if (!res.ok) { alert("Error al ocultar"); return; }
    setServicios((prev) => prev.map((s) => (s.id === id ? { ...s, visible: false } : s)));
    router.refresh();
  }

  async function reactivar(id: string) {
    const res = await fetch(`/api/servicios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: true }),
    });
    if (!res.ok) { alert("Error al reactivar"); return; }
    setServicios((prev) => prev.map((s) => (s.id === id ? { ...s, visible: true } : s)));
    router.refresh();
  }

  async function crearNuevo() {
    setAdding(true);
    setError(null);
    const nombre = (draft.nombre ?? "").toString().trim();
    if (!nombre) { setError("Nombre obligatorio"); setAdding(false); return; }
    const res = await fetch(`/api/servicios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        precio_mxn: Number(draft.precio_mxn) || 0,
        duracion_min: Number(draft.duracion_min) || 60,
        categoria: draft.categoria ?? null,
        descripcion: draft.descripcion ?? null,
        retoque_dias_obligatorio: draft.retoque_dias_obligatorio ?? null,
        retoque_precio_mxn: draft.retoque_precio_mxn ?? null,
        retoque_anual_dias: draft.retoque_anual_dias ?? null,
        retoque_anual_precio_mxn: draft.retoque_anual_precio_mxn ?? null,
        orden: (servicios[servicios.length - 1]?.orden ?? 0) + 1,
      }),
    });
    const j = await res.json();
    if (!res.ok) { setError(j.error || "Error al crear"); setAdding(false); return; }
    setServicios([...servicios, j.servicio]);
    setDraft({});
    setAdding(false);
    router.refresh();
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setEditingId("__new__"); setDraft({ nombre: "", precio_mxn: 0, duracion_min: 60 }); }}
            className="btn-primary !text-xs !py-1.5"
          >
            <Plus className="w-3 h-3" /> Nuevo servicio
          </button>
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="btn-ghost !text-xs !py-1.5"
            title="Mostrar/ocultar servicios archivados"
          >
            {showHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showHidden ? "Ocultar archivados" : "Ver archivados"}
          </button>
        </div>
        <span className="text-xs text-[var(--muted-foreground)]">
          {visibles.length} servicios{showHidden ? " (incluye archivados)" : ""}
        </span>
      </div>

      {/* Form de nuevo arriba */}
      {editingId === "__new__" && (
        <div className="card mb-3 border-2 border-[var(--primary)]/40">
          <p className="eyebrow !text-[var(--primary-dark)] mb-2">Nuevo servicio</p>
          <FormFields draft={draft} setDraft={setDraft} />
          {error && <p className="text-xs text-[var(--destructive)] mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={crearNuevo} disabled={adding} className="btn-primary !text-xs">
              <Save className="w-3 h-3" /> {adding ? "Creando…" : "Crear"}
            </button>
            <button onClick={cancelEdit} className="btn-ghost !text-xs"><X className="w-3 h-3" /> Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card !p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              <th className="text-left px-4 py-2.5 font-medium">Servicio</th>
              <th className="text-left px-3 py-2.5 font-medium">Categoría</th>
              <th className="text-right px-3 py-2.5 font-medium">Precio</th>
              <th className="text-right px-3 py-2.5 font-medium">Duración</th>
              <th className="text-right px-3 py-2.5 font-medium">Retoque</th>
              <th className="text-right px-3 py-2.5 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) =>
              editingId === s.id ? (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 bg-[var(--secondary)]/10">
                  <td colSpan={6} className="p-4">
                    <FormFields draft={draft} setDraft={setDraft} />
                    {error && <p className="text-xs text-[var(--destructive)] mt-2">{error}</p>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={saveEdit} disabled={saving} className="btn-primary !text-xs">
                        <Save className="w-3 h-3" /> {saving ? "Guardando…" : "Guardar"}
                      </button>
                      <button onClick={cancelEdit} className="btn-ghost !text-xs"><X className="w-3 h-3" /> Cancelar</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className={`border-b border-[var(--border)] last:border-0 ${!s.visible ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5 text-sm font-medium">
                    {s.nombre}
                    {!s.visible && <span className="ml-2 text-[10px] uppercase text-[var(--muted-foreground)]">(archivado)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-[var(--muted-foreground)]">{s.categoria ?? "—"}</td>
                  <td className="px-3 py-2.5 text-sm text-right font-mono">{fmtMxn(s.precio_mxn)}</td>
                  <td className="px-3 py-2.5 text-sm text-right">{s.duracion_min} min</td>
                  <td className="px-3 py-2.5 text-sm text-right text-[var(--muted-foreground)]">
                    {s.retoque_dias_obligatorio ? `${s.retoque_dias_obligatorio}d` : "—"}
                    {s.retoque_anual_dias ? ` + ${s.retoque_anual_dias}d` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => startEdit(s)}
                        className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--primary-dark)]"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {s.visible ? (
                        <button
                          onClick={() => archivar(s.id)}
                          className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                          title="Archivar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivar(s.id)}
                          className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--sage-deep)]"
                          title="Reactivar"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormFields({
  draft, setDraft,
}: {
  draft: Partial<Servicio>;
  setDraft: (d: Partial<Servicio>) => void;
}) {
  function set<K extends keyof Servicio>(k: K, v: Servicio[K] | null) {
    setDraft({ ...draft, [k]: v });
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="Nombre *">
        <input
          type="text"
          value={draft.nombre ?? ""}
          onChange={(e) => set("nombre", e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Categoría">
        <input
          type="text"
          value={draft.categoria ?? ""}
          onChange={(e) => set("categoria", e.target.value)}
          placeholder="microblading / peeling / remoción…"
        />
      </Field>
      <Field label="Precio MXN *">
        <input
          type="number"
          value={draft.precio_mxn ?? ""}
          onChange={(e) => set("precio_mxn", e.target.value ? Number(e.target.value) : 0)}
        />
      </Field>
      <Field label="Duración (min) *">
        <input
          type="number"
          value={draft.duracion_min ?? ""}
          onChange={(e) => set("duracion_min", e.target.value ? Number(e.target.value) : 60)}
        />
      </Field>
      <Field label="Retoque obligatorio (días)">
        <input
          type="number"
          value={draft.retoque_dias_obligatorio ?? ""}
          onChange={(e) => set("retoque_dias_obligatorio", e.target.value ? Number(e.target.value) : null)}
          placeholder="60"
        />
      </Field>
      <Field label="Precio retoque MXN">
        <input
          type="number"
          value={draft.retoque_precio_mxn ?? ""}
          onChange={(e) => set("retoque_precio_mxn", e.target.value ? Number(e.target.value) : null)}
          placeholder="1500"
        />
      </Field>
      <Field label="Retoque anual (días)">
        <input
          type="number"
          value={draft.retoque_anual_dias ?? ""}
          onChange={(e) => set("retoque_anual_dias", e.target.value ? Number(e.target.value) : null)}
          placeholder="365"
        />
      </Field>
      <Field label="Precio retoque anual">
        <input
          type="number"
          value={draft.retoque_anual_precio_mxn ?? ""}
          onChange={(e) => set("retoque_anual_precio_mxn", e.target.value ? Number(e.target.value) : null)}
          placeholder="2200"
        />
      </Field>
      <Field label="Descripción" span2>
        <textarea
          rows={2}
          value={draft.descripcion ?? ""}
          onChange={(e) => set("descripcion", e.target.value)}
        />
      </Field>
    </div>
  );
}

function Field({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? "sm:col-span-2 lg:col-span-3" : ""}>
      <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}
