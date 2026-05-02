import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Send, Eye, Mail, MessageCircle, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const TIPO_LABEL: Record<string, string> = {
  reactivacion_dormidas: "Reactivación dormidas",
  cumpleanos: "Cumpleaños",
  retoque_60d: "Retoque 60 días",
  retoque_anual: "Retoque anual",
  pedir_resena: "Reseñas Google",
  cross_sell: "Cross-sell",
  broadcast_libre: "Broadcast libre",
};

const TIPO_EMOJI: Record<string, string> = {
  reactivacion_dormidas: "🌿",
  cumpleanos: "🎂",
  retoque_60d: "⏰",
  retoque_anual: "✨",
  pedir_resena: "⭐",
  cross_sell: "💄",
  broadcast_libre: "💌",
};

export default async function Page() {
  const sb = await createClient();
  const { data: campanias } = await sb
    .from("campanias")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="max-w-6xl">
      <header className="mb-8">
        <p className="eyebrow">Historial de envíos</p>
        <h1 className="text-3xl mt-1">Campañas</h1>
      </header>

      {campanias?.length === 0 ? (
        <div className="card text-center py-16">
          <Send className="w-10 h-10 text-[var(--sage)] mx-auto mb-3 opacity-50" />
          <p className="text-lg mb-2">Aún no has lanzado campañas</p>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            Ve a Retención y selecciona dormidas, retoques o cumpleaños para mandar tu primera campaña con tu voz.
          </p>
          <Link href="/retencion" className="btn-primary">
            <Sparkles className="w-4 h-4" /> Ir a Retención
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campanias?.map((c) => (
            <Link key={c.id} href={`/campanias/${c.id}`} className="card hover:border-[var(--primary)]/40 transition-colors block">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--secondary)]/40 flex items-center justify-center text-lg shrink-0">
                    {TIPO_EMOJI[c.tipo] ?? "💬"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{c.nombre}</h3>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      {TIPO_LABEL[c.tipo] ?? c.tipo} · {fmtDateTime(c.created_at)}
                    </p>
                    {c.contenido && (
                      <p className="text-xs text-[var(--muted-foreground)] mt-2 line-clamp-2 italic">
                        &ldquo;{c.contenido}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.estado === "completada" ? "bg-[var(--sage-light)] text-[var(--sage-deep)]" :
                    c.estado === "enviando" ? "bg-[hsl(35_90%_55%_/_0.15)] text-[var(--warning)]" :
                    "bg-[var(--muted)] text-[var(--muted-foreground)]"
                  }`}>
                    {c.estado}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                <Stat label="Destinatarias" value={c.total_destinatarios} />
                <Stat label="Enviados" value={c.total_enviados} />
                <Stat label="Leídos" value={c.total_leidos ?? 0} dim />
                <Stat label="Conversiones" value={c.total_conversiones ?? 0} dim />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">{label}</p>
      <p className={`text-lg font-bold ${dim ? "text-[var(--muted-foreground)]" : ""}`}>{value}</p>
    </div>
  );
}
