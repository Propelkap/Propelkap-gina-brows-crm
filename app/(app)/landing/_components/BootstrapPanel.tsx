"use client";

import { useState } from "react";
import { Loader2, Rocket } from "lucide-react";

type Landing = any;
type Section = any;

export default function BootstrapPanel({
  onCreated,
}: {
  onCreated: (landing: Landing, sections: Section[]) => void;
}) {
  const [brandName, setBrandName] = useState("");
  const [slug, setSlug] = useState("");
  const [planTier, setPlanTier] = useState<"mensual" | "anual">("mensual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/landing/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug || slugify(brandName),
          brand_name: brandName,
          plan_tier: planTier,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        onCreated(data.landing, data.sections);
      } else {
        setError(data.error ?? "error desconocido");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
      <div className="w-12 h-12 rounded-xl bg-[var(--lime)] flex items-center justify-center mb-4">
        <Rocket className="w-5 h-5 text-[var(--navy-deep)]" />
      </div>
      <h2 className="text-xl font-semibold mb-1">Crea tu landing</h2>
      <p className="text-sm text-[hsl(220_15%_55%)] mb-6">
        Vivirá en{" "}
        <span className="font-mono">
          {slug || slugify(brandName) || "<slug>"}.os.propelkap.com
        </span>
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            Nombre de marca
          </label>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Haydeé Pérez · Asesora Pensiones"
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            Slug (URL)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder={brandName ? slugify(brandName) : "haydee-perez"}
              className="flex-1 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] font-mono text-sm"
            />
            <span className="text-xs text-[hsl(220_15%_55%)]">.os.propelkap.com</span>
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider mb-1.5 block">
            Plan
          </label>
          <select
            value={planTier}
            onChange={(e) => setPlanTier(e.target.value as "mensual" | "anual")}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
          >
            <option value="mensual">Mensual · 50 generaciones IA/día</option>
            <option value="anual">Anual · 200 generaciones IA/día</option>
          </select>
        </div>

        {error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
            {error}
          </div>
        )}

        <button
          onClick={onSubmit}
          disabled={!brandName.trim() || loading}
          className="w-full bg-[var(--navy-deep)] text-[var(--lime)] py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Crear landing"
          )}
        </button>
      </div>
    </div>
  );
}
