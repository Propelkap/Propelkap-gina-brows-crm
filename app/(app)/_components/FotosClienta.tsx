"use client";

import { useEffect, useState, useRef } from "react";
import { Camera, Upload, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Foto = { id: string; storage_path: string; tipo: string; descripcion: string | null; created_at: string; signed_url?: string };

const TIPOS = [
  { id: "antes", label: "Antes" },
  { id: "durante", label: "Durante" },
  { id: "despues", label: "Después" },
  { id: "cicatrizacion", label: "Cicatrización" },
  { id: "general", label: "General" },
];

export default function FotosClienta({ clienteId, fotos: initialFotos }: { clienteId: string; fotos: Foto[] }) {
  const router = useRouter();
  const sb = createClient();
  const [fotos, setFotos] = useState<Foto[]>(initialFotos);
  const [tipo, setTipo] = useState("antes");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar URLs firmadas al montar
  useEffect(() => {
    (async () => {
      const updated = await Promise.all(fotos.map(async (f) => {
        if (f.signed_url) return f;
        const { data } = await sb.storage.from("clientes-fotos").createSignedUrl(f.storage_path, 3600);
        return { ...f, signed_url: data?.signedUrl };
      }));
      setFotos(updated);
    })();
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("cliente_id", clienteId);
    form.append("tipo", tipo);
    const res = await fetch("/api/fotos", { method: "POST", body: form });
    const j = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(j.error || "Error al subir");
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function deleteFoto(id: string) {
    if (!confirm("¿Eliminar esta foto? No se puede recuperar.")) return;
    setDeletingId(id);
    setError(null);
    const res = await fetch(`/api/fotos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "No pude eliminar la foto");
      setDeletingId(null);
      return;
    }
    setFotos((prev) => prev.filter((f) => f.id !== id));
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="!w-auto !py-2">
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="btn-primary cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Subiendo…" : "Subir foto"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
          />
        </label>
      </div>

      {error && <p className="text-sm text-[var(--destructive)] mb-3">{error}</p>}

      {fotos.length === 0 ? (
        <div className="card text-center py-10 text-[var(--muted-foreground)]">
          <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin fotos aún. Sube la primera arriba.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {fotos.map((f) => (
            <div key={f.id} className="relative group">
              {f.signed_url ? (
                <img
                  src={f.signed_url}
                  alt={f.tipo}
                  className="w-full aspect-square object-cover rounded-xl border border-[var(--border)]"
                />
              ) : (
                <div className="w-full aspect-square rounded-xl bg-[var(--muted)] animate-pulse" />
              )}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-[var(--foreground)]/80 text-[var(--background)] text-xs font-medium capitalize">
                {f.tipo}
              </div>
              <button
                type="button"
                onClick={() => deleteFoto(f.id)}
                disabled={deletingId === f.id}
                title="Eliminar foto"
                aria-label="Eliminar foto"
                className="absolute top-2 right-2 p-1.5 rounded-full bg-[var(--foreground)]/80 text-[var(--background)] hover:bg-[var(--destructive)] transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
