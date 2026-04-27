"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-[var(--secondary)]/40 flex items-center justify-center mx-auto mb-5 text-[var(--primary-dark)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="eyebrow mb-2">Gina Brows</p>
          <h1 className="text-3xl">Hello, hello 🌿</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Bienvenida a tu CRM
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-sm text-[var(--destructive)] py-2">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="text-xs text-center text-[var(--muted-foreground)] mt-8">
          PropelKap × Gina Brows
        </p>
      </div>
    </main>
  );
}
