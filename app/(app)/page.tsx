import { Calendar, Users, Heart, AlertTriangle, Gift, TrendingUp, Send, Star } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Kpis = {
  citas_hoy_pendientes: number;
  confirmar_24h: number;
  clientas_dormidas: number;
  retoques_60d_urgentes: number;
  retoques_anuales_urgentes: number;
  cumples_7d: number;
  cross_sell_sugeridos: number;
  ingreso_proyectado_hoy: number;
  ingreso_mes: number;
  citas_completadas_mes: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

async function getKpis(): Promise<Kpis | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("v_dashboard_kpis").select("*").single();
    if (error) return null;
    return data as Kpis;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const kpis = await getKpis();
  const today = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  if (!kpis) {
    return (
      <div className="max-w-2xl py-20">
        <p className="eyebrow mb-3">Pendiente de conexión</p>
        <h1 className="text-3xl mb-4">El CRM está vivo pero todavía no tiene base de datos.</h1>
        <p className="text-[var(--muted-foreground)] leading-relaxed">
          Falta correr la migración SQL en Supabase y conectar las variables de entorno.
          Una vez que esté conectado, aquí verás tu dashboard con citas de hoy, clientas dormidas,
          retoques pendientes y todo lo demás.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <header className="mb-8">
        <p className="eyebrow capitalize">{today}</p>
        <h1 className="text-4xl mt-2">Hello, hello 🌿</h1>
        <p className="text-[var(--muted-foreground)] mt-1">Esto es lo que está pasando hoy.</p>
      </header>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Citas hoy" value={kpis.citas_hoy_pendientes} icon={<Calendar className="w-4 h-4" />} accent />
        <Stat label="Ingreso proyectado hoy" value={fmt(kpis.ingreso_proyectado_hoy)} small icon={<TrendingUp className="w-4 h-4" />} />
        <Stat label="Ingreso del mes" value={fmt(kpis.ingreso_mes)} small icon={<TrendingUp className="w-4 h-4" />} />
        <Stat label="Citas completadas mes" value={kpis.citas_completadas_mes} icon={<Star className="w-4 h-4" />} />
      </div>

      <h2 className="text-lg mb-3 mt-10">Acciones que requieren tu atención</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <ActionCard
          href="/agenda?filter=confirmar"
          icon={<AlertTriangle className="w-5 h-5" />}
          title="Por confirmar próximas 24h"
          count={kpis.confirmar_24h}
          accent="warning"
        />
        <ActionCard
          href="/retencion?tab=retoques-60d"
          icon={<Heart className="w-5 h-5" />}
          title="Retoques 60d urgentes / vencidos"
          count={kpis.retoques_60d_urgentes}
          accent="warning"
        />
        <ActionCard
          href="/retencion?tab=retoques-anuales"
          icon={<Heart className="w-5 h-5" />}
          title="Retoques anuales urgentes / vencidos"
          count={kpis.retoques_anuales_urgentes}
          accent="warning"
        />
        <ActionCard
          href="/retencion?tab=dormidas"
          icon={<Users className="w-5 h-5" />}
          title="Clientas dormidas listas para reactivar"
          count={kpis.clientas_dormidas}
          accent="primary"
        />
        <ActionCard
          href="/retencion?tab=cumples"
          icon={<Gift className="w-5 h-5" />}
          title="Cumpleaños próximos 7 días"
          count={kpis.cumples_7d}
        />
        <ActionCard
          href="/retencion?tab=cross-sell"
          icon={<Send className="w-5 h-5" />}
          title="Cross-sell sugerido (microblading → peeling)"
          count={kpis.cross_sell_sugeridos}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, icon, accent, small }: { label: string; value: number | string; icon: React.ReactNode; accent?: boolean; small?: boolean }) {
  return (
    <div className={`card ${accent ? "bg-[var(--secondary)]/30 border-[var(--primary)]" : ""}`}>
      <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className={`font-semibold ${small ? "text-2xl" : "text-3xl"}`}>{value}</div>
    </div>
  );
}

function ActionCard({ href, icon, title, count, accent }: { href: string; icon: React.ReactNode; title: string; count: number; accent?: "warning" | "primary" }) {
  const colors = accent === "warning"
    ? "text-[var(--warning)] bg-[hsl(35_90%_55%_/_0.12)]"
    : accent === "primary"
    ? "text-[var(--primary-dark)] bg-[var(--secondary)]/40"
    : "text-[var(--sage-deep)] bg-[var(--sage-light)]";

  return (
    <Link href={href} className="card hover:shadow-[0_4px_24px_-8px_hsl(149_30%_28%_/_0.15)] transition-shadow flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{title}</p>
      </div>
      <div className="text-2xl font-bold text-[var(--foreground)]">{count}</div>
    </Link>
  );
}
