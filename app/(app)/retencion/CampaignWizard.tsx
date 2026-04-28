"use client";

import { useState } from "react";
import { X, Send, Sparkles, Check, AlertCircle } from "lucide-react";

const TEMPLATES: Record<string, { titulo: string; copy: string; help: string }> = {
  dormidas: {
    titulo: "Reactivación de dormidas",
    copy: "Hello, hello {{nombre}} 🌿 Te extrañamos por aquí en Gina Brows. Quería invitarte con un detallito especial: tu próxima cita la pasas con diseño de ceja gratis 💜 ¿Cuándo te apartamos espacio?",
    help: "Tono cálido + incentivo claro. Las clientas dormidas necesitan razón para volver."
  },
  "retoques-60d": {
    titulo: "Recordatorio retoque 60 días",
    copy: "Hello, hello {{nombre}} 🌿 Pasaron casi 60 días desde tu microblading. Es momento del retoque para que tus cejitas queden hermosas y duren más. ¿Te aparto cita esta semana?",
    help: "Recordatorio amable. Si pasa de 60 días la garantía cambia."
  },
  "retoques-anuales": {
    titulo: "Aviso retoque anual",
    copy: "Hello, hello {{nombre}} 🌿 Ya cumplió un año tu microblading. Es momento del retoque anual para mantener tus cejitas en su mejor versión. Si lo agendas este mes, se mantiene el precio especial. ¿Te aparto?",
    help: "$2,200 promedio recuperado por cada uno que regresa."
  },
  cumples: {
    titulo: "Felicitación de cumpleaños",
    copy: "Hello, hello {{nombre}} 🎂 ¡Feliz cumpleaños! De parte de todo Gina Brows te regalamos un diseño de ceja gratis para que estrenes el día. Válido los próximos 30 días. ✨",
    help: "Cupón de cumpleaños. Pequeño detalle que genera engagement enorme."
  },
  "cross-sell": {
    titulo: "Cross-sell post-microblading",
    copy: "Hello, hello {{nombre}} 🌿 Ya pasaron 90 días desde tu microblading. Para mantener tu piel del rostro lista, te recomiendo el Hollywood Peeling — tengo paquete de 3 sesiones a precio especial. ¿Te interesa?",
    help: "Microblading → Peeling 90d. Cross-sell natural detectado por el sistema."
  },
};

export default function CampaignWizard({
  onClose,
  recipients,
  tipo,
}: {
  onClose: () => void;
  recipients: Array<{ id: string; nombre: string; whatsapp: string }>;
  tipo: string;
}) {
  const template = TEMPLATES[tipo] ?? TEMPLATES.dormidas;
  const [copy, setCopy] = useState(template.copy);
  const [step, setStep] = useState<"editar" | "preview" | "enviado">("editar");
  const [sending, setSending] = useState(false);

  const previewName = recipients[0]?.nombre.split(" ")[0] ?? "Cliente";
  const previewMsg = copy.replace(/\{\{nombre\}\}/g, previewName);
  const validRecipients = recipients.filter((r) => r.whatsapp);

  async function simulate() {
    setSending(true);
    // En producción aquí va POST a /api/campanias/enviar
    // Por ahora simulamos para que JP pueda demostrar el flujo a Gina
    await new Promise((r) => setTimeout(r, Math.min(1500, validRecipients.length * 30)));
    setStep("enviado");
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.6)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--background)] rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--background)] z-10">
          <div>
            <p className="eyebrow !text-[var(--primary-dark)] mb-0.5">Campaña · {step}</p>
            <h2 className="text-xl">{template.titulo}</h2>
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
                  <p className="text-xs text-[var(--muted-foreground)]">{template.help}</p>
                </div>
              </div>

              <label className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-2 block">
                Mensaje (usa <code className="bg-[var(--muted)] px-1 rounded">{`{{nombre}}`}</code> para personalizar)
              </label>
              <textarea
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                className="!min-h-[140px]"
                placeholder="Escribe tu mensaje aquí…"
              />

              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                {copy.length} caracteres · {copy.split(/\s+/).filter(Boolean).length} palabras
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
                <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-2 font-medium">Destinatarias</p>
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
                  <strong>Modo simulación:</strong> el envío real por WhatsApp Business API se activa cuando Twilio + templates de Meta queden aprobados (esta semana). Por ahora el sistema registra la campaña y simula la entrega.
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep("editar")} className="btn-ghost flex-1 justify-center">← Editar</button>
                <button onClick={simulate} disabled={sending} className="btn-primary flex-1 justify-center">
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
                {validRecipients.length} mensajes simulados. Cuando WhatsApp Business esté activo, se mandan automáticamente con tu voz.
              </p>
              <button onClick={onClose} className="btn-primary">Listo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
