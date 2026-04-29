"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, AlertCircle, Loader2 } from "lucide-react";

// Carga el canvas solo en el cliente (no SSR). Cast a any porque next/dynamic pierde tipos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SignatureCanvas = dynamic(() => import("react-signature-canvas"), { ssr: false }) as any;

type SaludQ = { id: string; pregunta: string };
type DataPField = { id: string; label: string; tipo: string; requerido?: boolean };
type Estructura = {
  titulo: string;
  datos_personales: DataPField[];
  declaraciones: string[];
  salud: SaludQ[];
  autoriza_fotos: { pregunta: string; requerido?: boolean };
  enlace: string[];
  cuidados_posteriores: string;
  autorizacion_artista: string;
};

type Cliente = { nombre: string; apellido: string | null; email: string | null; whatsapp: string | null; fecha_nacimiento: string | null };

export default function ConsentimientoForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<{ nombre: string; estructura: Estructura } | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, string | boolean>>({});
  const [iniciales, setIniciales] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showFirma, setShowFirma] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigRef = useRef<any>(null);

  // Cargar template
  useEffect(() => {
    fetch(`/api/consentimientos/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setTemplate(j.template);
          setCliente(j.cliente);
          // Pre-llenar datos personales que ya tenemos
          if (j.cliente) {
            const pre: Record<string, string> = {};
            const nombreFull = `${j.cliente.nombre ?? ""} ${j.cliente.apellido ?? ""}`.trim();
            pre.nombre = nombreFull;
            if (j.cliente.email) pre.email = j.cliente.email;
            if (j.cliente.whatsapp) pre.telefono = j.cliente.whatsapp;
            if (j.cliente.fecha_nacimiento) pre.fecha_nacimiento = j.cliente.fecha_nacimiento;
            setRespuestas(pre);
          }
        } else {
          setError(j.error || "Link inválido");
        }
      })
      .catch(() => setError("Error al cargar el formulario"))
      .finally(() => setLoading(false));
  }, [token]);

  function setResp(id: string, v: string | boolean) {
    setRespuestas({ ...respuestas, [id]: v });
  }

  function setInicial(key: string, v: string) {
    setIniciales({ ...iniciales, [key]: v.toUpperCase().slice(0, 4) });
  }

  function validar(): string | null {
    if (!template) return null;
    const e = template.estructura;

    // Datos personales requeridos
    for (const f of e.datos_personales) {
      if (f.requerido && !respuestas[f.id]) return `Falta: ${f.label}`;
    }

    // Iniciales en cada declaración
    for (let i = 0; i < e.declaraciones.length; i++) {
      if (!iniciales[`decl_${i}`] || iniciales[`decl_${i}`].length < 2) {
        return `Pon tus iniciales (mín 2 letras) en la declaración ${i + 1}`;
      }
    }

    // Todas las preguntas de salud deben tener respuesta
    for (const q of e.salud) {
      if (respuestas[`salud_${q.id}`] === undefined) return `Responde: ${q.pregunta}`;
    }

    // Autorización fotos requerida
    if (respuestas.autoriza_fotos === undefined) return "Responde si autorizas el uso de fotos";

    // Enlace
    for (let i = 0; i < e.enlace.length; i++) {
      if (respuestas[`enlace_${i}`] === undefined) return `Responde la pregunta ${i + 1} del enlace final`;
    }

    // Firma
    if (sigRef.current?.isEmpty?.()) return "Por favor firma con tu dedo en el recuadro";

    return null;
  }

  async function submit() {
    const err = validar();
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    setSubmitting(true);
    const firmaDataUrl = sigRef.current?.toDataURL?.("image/png");
    const res = await fetch(`/api/consentimientos/${token}/firmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ respuestas, iniciales, firma_data_url: firmaDataUrl }),
    });
    const j = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(j.error || "Error al guardar");
      return;
    }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-dark)]" />
      </main>
    );
  }

  if (error && !template) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-[var(--destructive)] mx-auto mb-3" />
          <h1 className="text-xl mb-2">No pudimos abrir tu formulario</h1>
          <p className="text-[var(--muted-foreground)] text-sm">{error}</p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--sage-light)] mx-auto mb-5 flex items-center justify-center">
            <Check className="w-7 h-7 text-[var(--sage-deep)]" />
          </div>
          <h1 className="text-2xl mb-2">¡Listo, {(cliente?.nombre ?? "").split(" ")[0]}! 🌿</h1>
          <p className="text-[var(--muted-foreground)] leading-relaxed">
            Tu consentimiento quedó registrado. Estás lista para tu tratamiento. ✨
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-6">
            — Gina Brows Microblading Artist
          </p>
        </div>
      </main>
    );
  }

  if (!template) return null;
  const e = template.estructura;

  return (
    <main className="min-h-screen pb-24">
      <header className="bg-[var(--card)] border-b border-[var(--border)] px-6 py-6 sticky top-0 z-20">
        <p className="eyebrow !text-[var(--primary-dark)] mb-1">Gina Brows</p>
        <h1 className="text-xl md:text-2xl">{template.nombre}</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-[hsl(0_84%_60%_/_0.1)] border border-[var(--destructive)] rounded-xl p-4 flex items-start gap-2 sticky top-24 z-10">
            <AlertCircle className="w-4 h-4 text-[var(--destructive)] mt-0.5 shrink-0" />
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          </div>
        )}

        <p className="text-sm text-[var(--muted-foreground)] bg-[var(--secondary)]/15 border border-[var(--primary)] rounded-xl p-4">
          Hola {cliente?.nombre} 🌿 Por favor llena este formulario antes de iniciar tu tratamiento. Toma 3-5 min. Tus datos quedan guardados de forma segura solo en el sistema de Gina Brows.
        </p>

        {/* DATOS PERSONALES */}
        <Section title="Tus datos">
          {e.datos_personales.map((f) => (
            <div key={f.id}>
              <label className="block text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium">
                {f.label} {f.requerido && <span className="text-[var(--destructive)]">*</span>}
              </label>
              <input
                type={f.tipo === "date" ? "date" : f.tipo === "email" ? "email" : f.tipo === "tel" ? "tel" : "text"}
                value={String(respuestas[f.id] ?? "")}
                onChange={(ev) => setResp(f.id, ev.target.value)}
              />
            </div>
          ))}
        </Section>

        {/* DECLARACIONES con iniciales */}
        <Section title="Declaraciones">
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            Lee cada punto y pon tus iniciales (ej. "GT") al lado para confirmar que entendiste:
          </p>
          {e.declaraciones.map((d, i) => (
            <div key={i} className="flex gap-3 items-start py-2 border-b border-[var(--border)] last:border-0">
              <input
                type="text"
                value={iniciales[`decl_${i}`] ?? ""}
                onChange={(ev) => setInicial(`decl_${i}`, ev.target.value)}
                placeholder="GT"
                className="!w-16 !text-center font-semibold !uppercase shrink-0 !text-sm !py-1.5"
                maxLength={4}
              />
              <p className="text-sm leading-relaxed flex-1">{d}</p>
            </div>
          ))}
        </Section>

        {/* SALUD */}
        <Section title="Formulario de salud">
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            ¿Padeces alguna de estas condiciones o tomas alguno de estos medicamentos?
          </p>
          {e.salud.map((q) => {
            const respId = `salud_${q.id}`;
            const val = respuestas[respId];
            return (
              <div key={q.id} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0">
                <p className="text-sm flex-1">{q.pregunta}</p>
                <div className="flex gap-1.5 shrink-0">
                  <SiNoBtn label="Sí" active={val === true || val === "si"} onClick={() => setResp(respId, true)} variant="warning" />
                  <SiNoBtn label="No" active={val === false || val === "no"} onClick={() => setResp(respId, false)} variant="ok" />
                </div>
              </div>
            );
          })}
          <div className="mt-4">
            <label className="block text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium">
              Si respondiste SÍ a alguna, escribe explicación detallada
            </label>
            <textarea
              rows={3}
              value={String(respuestas.salud_explicacion ?? "")}
              onChange={(ev) => setResp("salud_explicacion", ev.target.value)}
            />
          </div>
        </Section>

        {/* AUTORIZACIÓN FOTOS */}
        <Section title="Uso de imágenes">
          <p className="text-sm leading-relaxed">{e.autoriza_fotos.pregunta}</p>
          <div className="flex gap-2 mt-3">
            <SiNoBtn label="Sí, autorizo" active={respuestas.autoriza_fotos === true} onClick={() => setResp("autoriza_fotos", true)} variant="ok" full />
            <SiNoBtn label="No autorizo" active={respuestas.autoriza_fotos === false} onClick={() => setResp("autoriza_fotos", false)} variant="warning" full />
          </div>
        </Section>

        {/* AUTORIZACIÓN ARTISTA */}
        <Section title="Autorización">
          <p className="text-sm leading-relaxed">{e.autorizacion_artista}</p>
        </Section>

        {/* ENLACE */}
        <Section title="Confirmaciones finales">
          {e.enlace.map((d, i) => {
            const respId = `enlace_${i}`;
            const val = respuestas[respId];
            return (
              <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0">
                <p className="text-sm flex-1">{d}</p>
                <div className="flex gap-1.5 shrink-0">
                  <SiNoBtn label="Sí" active={val === true} onClick={() => setResp(respId, true)} variant="ok" />
                  <SiNoBtn label="No" active={val === false} onClick={() => setResp(respId, false)} variant="warning" />
                </div>
              </div>
            );
          })}
        </Section>

        {/* CUIDADOS POSTERIORES (informativo) */}
        <Section title="Cuidados posteriores (importante)">
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed whitespace-pre-line">{e.cuidados_posteriores}</p>
        </Section>

        {/* FIRMA */}
        <Section title="Firma con tu dedo">
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            Firma dentro del recuadro usando tu dedo (en iPad) o el cursor (en computadora):
          </p>
          {!showFirma && (
            <button onClick={() => setShowFirma(true)} className="btn-primary w-full justify-center">
              Activar firma
            </button>
          )}
          {showFirma && (
            <>
              <div className="border-2 border-[var(--primary)] rounded-xl bg-white overflow-hidden touch-none">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#1a1416"
                  canvasProps={{ className: "w-full", style: { width: "100%", height: 200, touchAction: "none" } }}
                />
              </div>
              <button
                onClick={() => sigRef.current?.clear?.()}
                className="text-xs text-[var(--muted-foreground)] mt-2 underline"
              >
                Borrar y firmar de nuevo
              </button>
            </>
          )}
        </Section>

        {/* SUBMIT */}
        <button
          onClick={submit}
          disabled={submitting || !showFirma}
          className="btn-primary w-full justify-center !py-4 !text-base"
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : "Firmar consentimiento"}
        </button>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="text-lg mb-4 font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SiNoBtn({ label, active, onClick, variant, full }: { label: string; active: boolean; onClick: () => void; variant: "ok" | "warning"; full?: boolean }) {
  const colors = active
    ? variant === "ok"
      ? "bg-[var(--sage-light)] text-[var(--sage-deep)] border-[var(--sage-deep)]"
      : "bg-[hsl(35_90%_55%_/_0.2)] text-[var(--warning)] border-[var(--warning)]"
    : "bg-white text-[var(--muted-foreground)] border-[var(--border)]";
  return (
    <button
      onClick={onClick}
      type="button"
      className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${colors} ${full ? "flex-1" : ""}`}
    >
      {label}
    </button>
  );
}
