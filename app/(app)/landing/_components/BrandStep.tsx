"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

const FONTS = [
  { value: "inter", label: "Inter (moderna · limpia)" },
  { value: "playfair", label: "Playfair (elegante · serif)" },
  { value: "manrope", label: "Manrope (técnica · neutra)" },
];

const VOICES = [
  { value: "formal", label: "Formal · usted distante · sin emojis" },
  { value: "cercano_usted", label: "Cercano · usted cálido · 1-2 emojis" },
  { value: "cercano_tu", label: "Cercano · tutea (tú) · 1-2 emojis" },
  { value: "experto", label: "Experto · usted · directo · datos primero" },
];

export default function BrandStep({
  landing,
  onUpdated,
}: {
  landing: any;
  onUpdated: (l: any) => void;
}) {
  const [config, setConfig] = useState(landing.config ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateColor = (k: string, v: string) =>
    setConfig({ ...config, colors: { ...(config.colors ?? {}), [k]: v } });

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/landing/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await r.json();
      if (data.ok) {
        onUpdated({ config });
      } else {
        setError(data.error ?? "save_failed");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-1">Marca</h2>
      <p className="text-sm text-[hsl(220_15%_55%)] mb-6">
        Tono, colores y tipografía que se aplican a toda tu landing.
      </p>

      <div className="space-y-5">
        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            Nombre de marca
          </label>
          <input
            type="text"
            value={config.brand_name ?? ""}
            onChange={(e) => setConfig({ ...config, brand_name: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            Tagline (opcional)
          </label>
          <input
            type="text"
            value={config.tagline ?? ""}
            onChange={(e) => setConfig({ ...config, tagline: e.target.value })}
            placeholder="Tu pensión, sin sorpresas"
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            Tono de voz
          </label>
          <select
            value={config.brand_voice ?? "cercano_usted"}
            onChange={(e) => setConfig({ ...config, brand_voice: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
          >
            {VOICES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            Tipografía
          </label>
          <select
            value={config.font ?? "inter"}
            onChange={(e) => setConfig({ ...config, font: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
          >
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block">
            Colores
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["primary", "accent", "bg", "text"] as const).map((k) => (
              <div key={k}>
                <p className="text-[0.7rem] text-[hsl(220_15%_55%)] mb-1 capitalize">
                  {k === "bg" ? "Fondo" : k === "primary" ? "Primario" : k === "accent" ? "Acento" : "Texto"}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.colors?.[k] ?? "#000000"}
                    onChange={(e) => updateColor(k, e.target.value)}
                    className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={config.colors?.[k] ?? ""}
                    onChange={(e) => updateColor(k, e.target.value)}
                    className="flex-1 px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            URL Cal.com (opcional)
          </label>
          <input
            type="text"
            value={config.contact?.calcom_url ?? ""}
            onChange={(e) =>
              setConfig({
                ...config,
                contact: { ...(config.contact ?? {}), calcom_url: e.target.value },
              })
            }
            placeholder="https://cal.com/tu-usuario/diagnostico"
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] font-mono text-sm"
          />
        </div>

        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg">
            {error}
          </div>
        )}

        <button
          onClick={onSave}
          disabled={saving || !config.brand_name?.trim()}
          className="bg-[var(--navy-deep)] text-[var(--lime)] px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar marca
        </button>
      </div>
    </div>
  );
}
