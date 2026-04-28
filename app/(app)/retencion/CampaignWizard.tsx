"use client";

import { useEffect, useState } from "react";
import { X, Send, Sparkles, Check, AlertCircle, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const TIPO_DEFAULT_COPY: Record<string, string> = {
  dormidas: "Hello, hello {{nombre}} 🌿 Te extrañamos por aquí en Gina Brows. Quería invitarte con un detallito especial: tu próxima cita la pasas con diseño de ceja gratis 💜 ¿Cuándo te apartamos espacio?",
  "retoques-60d": "Hello, hello {{nombre}} 🌿 Pasaron casi 60 días desde tu microblading. Es momento del retoque para que tus cejitas queden hermosas y duren más. ¿Te aparto cita esta semana?",
  "retoques-anuales": "Hello, hello {{nombre}} 🌿 Ya cumplió un año tu microblading. Es momento del retoque anual para mantener tus cejitas en su mejor versión. Si lo agendas este mes, se mantiene el precio especial. ¿Te aparto?",
  cumples: "Hello, hello {{nombre}} 🎂 ¡Feliz cumpleaños! De parte de todo Gina Brows te regalamos un diseño de ceja gratis para que estrenes el día. Válido los próximos 30 días. ✨",
  "cross-sell": "Hello, hello {{nombre}} 🌿 Ya pasaron 90 días desde tu microblading. Para mantener tu piel del rostro lista, te recomiendo el Hollywood Peeling — tengo paquete de 3 sesiones a precio especial. ¿Te interesa?",
};

const TIPO_NAMES: Record<string, string> = {
  dormidas: "Reactivación de dormidas",
  "retoques-60d": "Recordatorio retoque 60 días",
  "retoques-anuales": "Aviso retoque anual",
  cumples: "Felicitación de cumpleaños",
  "cross-sell": "Cross-sell post-microblading",
};

const TIPO_TO_CAMPANIA: Record<string, string> = {
  dormidas: "reactivacion_dormidas",
  "retoques-60d": "retoque_60d",
  "retoques-anuales": "retoque_anual",
  cumples: "cumpleanos",
  "cross-sell": "cross_sell",
};

type Template = { id: string; nombre: string; cuerpo_texto: string; emoji: string | null; tipo_campania: string | null };

export default function CampaignWizard({
  onClose, recipients, tipo,
}: {
  onClose: () => void;
  recipients: Array<{ id: string; nombre: string; whatsapp: string }>;
  tipo: string;
}) {
  const router = useRouter();
  const sb = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("custom");
  const [copy, setCopy] = useState(TIPO_DEFAULT_COPY[tipo] ?? "");
  const [step, setStep] = useState<"editar" | "preview" | "enviado">("editar");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviados, setEnviados] = useState(0);

  // Cargar templates guardados
  useEffect(() => {
    sb.from("email_templates")
      .select("id, nombre, cuerpo_texto, emoji, tipo_campania")
      .eq("tipo", "whatsapp")
      .eq("archivado", false)
      .order("ultimo_uso", { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        const list = (data ?? []) as Template[];
        setTemplates(list);
        // Auto-seleccionar template que matchee el tipo
        const match = list.find((t) => t.tipo_campania === TIPO_TO_CAMPANIA[tipo]);
        if (match) {
          setSelectedTemplate(match.id);
          setCopy(match.cuerpo_texto);
        }
      });
  }, [tipo]);

  const previewName = recipients[0]?.nombre.split(" ")[0] ?? "Cliente";
  const previewMsg = copy.replace(/\{\{nombre\}\}/g, previewName);
  const validRecipients = recipients.filter((r) => r.whatsapp);

  function selectTemplate(id: string) {
    setSelectedTemplate(id);
    if (id === "custom") return;
    const t = templates.find((x) => x.id === id);
    if (t) setCopy(t.cuerpo_texto);
  }

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch("/api/campanias/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: `${TIPO_NAMES[tipo]} · ${new Date().toLocaleDateString("es-MX")}`,
        tipo: TIPO_TO_CAMPANIA[tipo] || "broadcast_libre",
        template_id: selectedTemplate !== "custom" ? selectedTemplate : null,
        contenido: copy,
        canal: "whatsapp",
        destinatarios: validRecipients,
      }),
    });
    const j = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(j.error || "Error al enviar");
      return;
    }
    setEnviados(j.enviados);
    setStep("enviado");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.6)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--background)] rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--background)] z-10">
          <div>
            <p className="eyebrow !text-[var(--primary-dark)] mb-0.5">Campaña · {step}</p>
            <h2 className="text-xl">{TIPO_NAMES[tipo] ?? "Campaña"}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {step === "editar" && (
            <>
              <div className="bg-[var(--card)] rounded-xl p-4 mb-5 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[var(--primary-dark)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium mb-1">{validRecipients.length} destinatarias</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Cada mensaje se personaliza automáticamente con su nombre.
                  </p>
                </div>
              </div>

              {/* Selector de template */}
              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block">
                Template
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => selectTemplate(e.target.value)}
                className="mb-3"
              >
                <option value="custom">✏️ Escribir desde cero</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.nombre}
                  </option>
                ))}
              </select>

              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block">
                Mensaje (usa <code className="bg-[var(--muted)] px-1 rounded">{`{{nombre}}`}</code>)
              </label>
              <textarea
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                className="!min-h-[140px]"
              />
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                {copy.length} caracteres
              </p>

              <button
                onClick={() => setStep("preview")}
                disabled={!copy.trim() || validRecipients.length === 0}
                className="btn-primary w-full justify-center mt-6"
              >
                Vista previa →
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <div className="mb-5">
                <p className="text-xs uppercase tracking-wider text-[var(--sage-deep)] font-medium mb-3">
                  Así se va a ver para {previewName}
                </p>
                <div className="bg-[hsl(80_45%_92%)] rounded-2xl rounded-tl-sm p-4 border border-[var(--border)] max-w-md">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-[var(--foreground)]">{previewMsg}</p>
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-2 text-right">12:34 ✓✓</p>
                </div>
              </div>

              <div className="bg-[var(--card)] rounded-xl p-4 mb-5">
                <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-2 font-medium">Destinatarias ({validRecipients.length})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                  {validRecipients.slice(0, 10).map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Check className="w-3 h-3 text-[var(--success)]" />
                      <span className="font-medium">{r.nombre}</span>
                      <span className="text-[var(--muted-foreground)] font-mono text-xs ml-auto">{r.whatsapp}</span>
                    </div>
                  ))}
                  {validRecipients.length > 10 && (
                    <p className="text-xs text-[var(--muted-foreground)] pt-1">+ {validRecipients.length - 10} más…</p>
                  )}
                </div>
              </div>

              <div className="bg-[hsl(35_90%_55%_/_0.08)] border border-[var(--warning)] rounded-xl p-4 mb-5 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-[var(--warning)] mt-0.5 shrink-0" />
                <p className="text-xs">
                  <strong>Modo simulación:</strong> los mensajes quedan registrados en historial con estado <code>simulado</code>. Cuando Twilio Business API esté activo, el mismo botón los manda de verdad.
                </p>
              </div>

              {error && <div className="bg-[hsl(0_84%_60%_/_0.1)] border border-[var(--destructive)] rounded-xl p-3 text-sm text-[var(--destructive)] mb-3">{error}</div>}

              <div className="flex gap-2">
                <button onClick={() => setStep("editar")} className="btn-ghost flex-1 justify-center">← Editar</button>
                <button onClick={send} disabled={sending} className="btn-primary flex-1 justify-center">
                  {sending ? "Enviando…" : <><Send className="w-3.5 h-3.5" /> Enviar a {validRecipients.length}</>}
                </button>
              </div>
            </>
          )}

          {step === "enviado" && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-[var(--sage-light)] mx-auto mb-5 flex items-center justify-center">
                <Check className="w-7 h-7 text-[var(--sage-deep)]" />
              </div>
              <h3 className="text-2xl mb-2">Campaña registrada</h3>
              <p className="text-[var(--muted-foreground)] mb-6 max-w-sm mx-auto leading-relaxed">
                {enviados} mensajes simulados quedaron en el historial de cada clienta.
                Puedes verlos en su ficha o en la sección de Campañas.
              </p>
              <div className="flex gap-2 justify-center">
                <button onClick={onClose} className="btn-ghost">Cerrar</button>
                <a href="/campanias" className="btn-primary">Ver historial</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
