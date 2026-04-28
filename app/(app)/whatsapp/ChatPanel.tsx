"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Phone, ThumbsUp, ThumbsDown, Send, Sparkles, AlertCircle, Pause, Play, X, Bot, User } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Mensaje = {
  id: string;
  cuerpo: string;
  direccion: "entrante" | "saliente";
  enviado_at: string;
  template_usado: string | null;
};

export default function ChatPanel({ cliente, onBack }: { cliente: { id: string; nombre: string; apellido: string | null; whatsapp: string | null; bot_pausado: boolean }; onBack: () => void }) {
  const router = useRouter();
  const sb = createClient();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState<{ msg: Mensaje } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pausado, setPausado] = useState(cliente.bot_pausado);
  const [pausaMotivo, setPausaMotivo] = useState("");
  const [pausaModal, setPausaModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cargar mensajes
  useEffect(() => {
    setLoading(true);
    sb.from("comunicaciones")
      .select("id, cuerpo, direccion, enviado_at, template_usado")
      .eq("cliente_id", cliente.id)
      .eq("canal", "whatsapp")
      .order("enviado_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        setMensajes((data ?? []) as Mensaje[]);
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
      });
  }, [cliente.id]);

  async function togglePausa() {
    if (!pausado) {
      // Va a pausar → pedir motivo
      setPausaModal(true);
      return;
    }
    // Va a reanudar → directo
    await fetch(`/api/clientes/${cliente.id}/bot-pausa`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pausado: false }),
    });
    setPausado(false);
    router.refresh();
  }

  async function confirmarPausa() {
    await fetch(`/api/clientes/${cliente.id}/bot-pausa`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pausado: true, motivo: pausaMotivo }),
    });
    setPausado(true);
    setPausaModal(false);
    setPausaMotivo("");
    router.refresh();
  }

  async function thumbUp(msg: Mensaje) {
    await fetch("/api/bot-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comunicacion_id: msg.id, cliente_id: cliente.id, tipo: "up" }),
    });
  }

  return (
    <>
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 md:px-6 py-3 flex items-center gap-3 bg-[var(--card)]">
        <button onClick={onBack} className="md:hidden p-1 rounded-lg hover:bg-[var(--muted)]">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <Link href={`/clientas/${cliente.id}`} className="font-semibold hover:underline">{cliente.nombre} {cliente.apellido}</Link>
          <p className="text-xs text-[var(--muted-foreground)] font-mono">{cliente.whatsapp}</p>
        </div>
        {cliente.whatsapp && (
          <a
            href={`https://wa.me/${cliente.whatsapp.replace(/[^0-9]/g, "")}`}
            target="_blank" rel="noreferrer"
            className="text-[var(--primary-dark)] p-2"
            title="Abrir en WhatsApp"
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
        <button
          onClick={togglePausa}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            pausado
              ? "bg-[hsl(35_90%_55%_/_0.15)] text-[var(--warning)]"
              : "bg-[var(--sage-light)] text-[var(--sage-deep)]"
          }`}
        >
          {pausado ? <><Play className="w-3 h-3" /> Reanudar bot</> : <><Pause className="w-3 h-3" /> Pausar bot</>}
        </button>
      </div>

      {pausado && (
        <div className="bg-[hsl(35_90%_55%_/_0.1)] border-b border-[var(--warning)] px-6 py-2 flex items-center gap-2 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-[var(--warning)]" />
          <span>Bot pausado. Las respuestas automáticas están detenidas para esta clienta.</span>
        </div>
      )}

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-3">
        {loading && <p className="text-center text-sm text-[var(--muted-foreground)]">Cargando…</p>}
        {!loading && mensajes.length === 0 && (
          <div className="text-center py-12">
            <Sparkles className="w-8 h-8 mx-auto mb-3 text-[var(--sage)] opacity-50" />
            <p className="text-sm text-[var(--muted-foreground)]">Sin conversación previa.</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">Cuando WhatsApp esté activo, los mensajes aparecerán aquí.</p>
          </div>
        )}
        {mensajes.map((m) => {
          const isBot = m.direccion === "saliente";
          return (
            <div key={m.id} className={`flex ${isBot ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] md:max-w-md ${isBot ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  isBot
                    ? "bg-[hsl(80_45%_92%)] rounded-tr-sm border border-[var(--border)]"
                    : "bg-white rounded-tl-sm border border-[var(--border)]"
                }`}>
                  {m.cuerpo}
                </div>
                <div className="flex items-center gap-2 mt-1 px-2">
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    {new Date(m.enviado_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isBot && m.template_usado && (
                    <span className="text-[10px] text-[var(--sage-deep)] font-medium flex items-center gap-1">
                      <Bot className="w-2.5 h-2.5" /> bot
                    </span>
                  )}
                  {isBot && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => thumbUp(m)}
                        className="p-1 rounded-full hover:bg-[var(--sage-light)] text-[var(--muted-foreground)] hover:text-[var(--sage-deep)] transition-colors"
                        title="Buena respuesta"
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setFeedbackOpen({ msg: m })}
                        className="p-1 rounded-full hover:bg-[hsl(0_84%_60%_/_0.1)] text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors"
                        title="Mala respuesta — corregir"
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input para responder manualmente */}
      <div className="border-t border-[var(--border)] p-4 bg-[var(--card)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={pausado ? "Responder manualmente…" : "Tu mensaje (bot también responde)…"}
            className="!text-sm"
          />
          <button
            disabled={!draft.trim() || sending}
            className="btn-primary !px-4"
            onClick={async () => {
              setSending(true);
              await sb.from("comunicaciones").insert({
                cliente_id: cliente.id,
                canal: "whatsapp",
                direccion: "saliente",
                cuerpo: draft,
                template_usado: "manual",
              });
              setDraft("");
              setSending(false);
              // Recargar
              const { data } = await sb.from("comunicaciones")
                .select("id, cuerpo, direccion, enviado_at, template_usado")
                .eq("cliente_id", cliente.id).eq("canal", "whatsapp")
                .order("enviado_at", { ascending: true }).limit(200);
              setMensajes((data ?? []) as Mensaje[]);
              setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
            }}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-[var(--muted-foreground)] mt-1.5">
          📡 Envío real activo cuando Twilio Business API esté conectado. Por ahora se registra como mensaje en historial.
        </p>
      </div>

      {/* Modal feedback thumb-down */}
      {feedbackOpen && (
        <FeedbackDownModal
          mensaje={feedbackOpen.msg}
          clienteId={cliente.id}
          onClose={() => setFeedbackOpen(null)}
        />
      )}

      {/* Modal pausar bot */}
      {pausaModal && (
        <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.6)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--background)] rounded-3xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl">Pausar bot</h3>
              <button onClick={() => setPausaModal(false)} className="p-2 rounded-full hover:bg-[var(--muted)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              El bot dejará de responder automáticamente a {cliente.nombre}. Tú toma la conversación desde aquí.
            </p>
            <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block font-medium">¿Por qué? (opcional)</label>
            <textarea value={pausaMotivo} onChange={(e) => setPausaMotivo(e.target.value)} rows={3} placeholder="Ej: prefiere hablar conmigo directo" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPausaModal(false)} className="btn-ghost flex-1 justify-center">Cancelar</button>
              <button onClick={confirmarPausa} className="btn-primary flex-1 justify-center">Pausar bot</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FeedbackDownModal({ mensaje, clienteId, onClose }: { mensaje: Mensaje; clienteId: string; onClose: () => void }) {
  const [corregido, setCorregido] = useState("");
  const [contexto, setContexto] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    await fetch("/api/bot-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comunicacion_id: mensaje.id,
        cliente_id: clienteId,
        tipo: "down",
        mensaje_original: mensaje.cuerpo,
        mensaje_corregido: corregido,
        contexto,
      }),
    });
    setSubmitting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.6)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--background)] rounded-3xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="eyebrow !text-[var(--destructive)] mb-1">Corregir al bot</p>
            <h3 className="text-xl">¿Qué dijo mal?</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium">Lo que dijo mal el bot</p>
          <div className="bg-[hsl(0_84%_60%_/_0.05)] border-l-4 border-[var(--destructive)] rounded-xl p-3 text-sm whitespace-pre-wrap">
            {mensaje.cuerpo}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium block">Lo que SÍ debió decir</label>
          <textarea
            value={corregido}
            onChange={(e) => setCorregido(e.target.value)}
            rows={4}
            placeholder="Hello, hello [nombre] 🌿..."
            autoFocus
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Esto se inyecta al system prompt del bot como ejemplo. Mientras más correcciones, más aprende tu voz.
          </p>
        </div>

        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium block">Contexto (opcional)</label>
          <input
            type="text"
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Ej: la clienta preguntaba por precios, no debió decir tanto"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancelar</button>
          <button onClick={submit} disabled={submitting || !corregido.trim()} className="btn-primary flex-1 justify-center">
            {submitting ? "Guardando…" : "Enviar corrección"}
          </button>
        </div>
      </div>
    </div>
  );
}
