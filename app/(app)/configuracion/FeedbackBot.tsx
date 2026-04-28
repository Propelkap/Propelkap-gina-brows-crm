"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Bot, Brain, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Feedback = {
  id: string;
  tipo: "up" | "down";
  mensaje_original: string | null;
  mensaje_corregido: string | null;
  contexto: string | null;
  created_at: string;
  cliente: { nombre: string; apellido: string | null } | null;
};

const fmtDate = (s: string) => new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });

export default function FeedbackBot() {
  const sb = createClient();
  const [items, setItems] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState<"todos" | "up" | "down">("down");
  const [loading, setLoading] = useState(true);

  useEffect(() => { reload(); }, [filter]);

  async function reload() {
    setLoading(true);
    let q = sb.from("bot_feedback").select("*, cliente:clientes(nombre, apellido)").order("created_at", { ascending: false }).limit(50);
    if (filter !== "todos") q = q.eq("tipo", filter);
    const { data } = await q;
    setItems((data ?? []) as Feedback[]);
    setLoading(false);
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta corrección?")) return;
    await sb.from("bot_feedback").delete().eq("id", id);
    setItems(items.filter((f) => f.id !== id));
  }

  const totalDown = items.filter((f) => f.tipo === "down").length;
  const totalUp = items.filter((f) => f.tipo === "up").length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Bot className="w-4 h-4 text-[var(--primary-dark)]" />
        <p className="text-sm text-[var(--muted-foreground)]">
          Cada vez que corriges al bot con 👎, lo aprende y lo usa en futuras respuestas. Las primeras 5 correcciones se inyectan al system prompt.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterPill label="Correcciones (👎)" id="down" active={filter === "down"} onClick={() => setFilter("down")} icon={<ThumbsDown className="w-3 h-3" />} />
        <FilterPill label="Buenas (👍)" id="up" active={filter === "up"} onClick={() => setFilter("up")} icon={<ThumbsUp className="w-3 h-3" />} />
        <FilterPill label="Todos" id="todos" active={filter === "todos"} onClick={() => setFilter("todos")} />
      </div>

      {loading && <p className="text-sm text-[var(--muted-foreground)]">Cargando…</p>}

      {!loading && items.length === 0 && (
        <div className="card text-center py-10">
          <Brain className="w-8 h-8 mx-auto mb-2 text-[var(--sage)] opacity-50" />
          <p className="text-sm text-[var(--muted-foreground)]">
            {filter === "down"
              ? "Sin correcciones aún. El bot está aprendiendo limpio."
              : "Sin feedback en este filtro."}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((f) => {
          const nombre = f.cliente ? `${f.cliente.nombre} ${f.cliente.apellido ?? ""}`.trim() : "—";
          return (
            <div key={f.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  {f.tipo === "down" ? (
                    <ThumbsDown className="w-4 h-4 text-[var(--destructive)]" />
                  ) : (
                    <ThumbsUp className="w-4 h-4 text-[var(--sage-deep)]" />
                  )}
                  <span className="text-sm font-medium">{nombre}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{fmtDate(f.created_at)}</span>
                </div>
                <button onClick={() => eliminar(f.id)} className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] p-1" title="Eliminar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {f.tipo === "down" && (
                <>
                  {f.mensaje_original && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--destructive)] font-medium mb-1">Lo que dijo MAL</p>
                      <div className="bg-[hsl(0_84%_60%_/_0.05)] border-l-4 border-[var(--destructive)] rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {f.mensaje_original}
                      </div>
                    </div>
                  )}
                  {f.mensaje_corregido && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--sage-deep)] font-medium mb-1">Lo que SÍ debió decir</p>
                      <div className="bg-[var(--sage-light)] border-l-4 border-[var(--sage-deep)] rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {f.mensaje_corregido}
                      </div>
                    </div>
                  )}
                  {f.contexto && (
                    <p className="text-xs text-[var(--muted-foreground)] italic mt-2">Contexto: {f.contexto}</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({ label, id, active, onClick, icon }: { label: string; id: string; active: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
        active
          ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--primary)]"
          : "bg-white text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
