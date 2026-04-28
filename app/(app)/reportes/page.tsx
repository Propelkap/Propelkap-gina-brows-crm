import { createClient } from "@/lib/supabase/server";
import { TrendingUp, Users, Heart, Award, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const fmtMonthEs = (s: string) => {
  // s: 'YYYY-MM'
  const [y, m] = s.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("es-MX", { month: "short", year: "numeric" });
};

export default async function Page() {
  const sb = await createClient();

  const [citasRes, clientesRes, serviciosRes] = await Promise.all([
    sb.from("citas").select("inicio, estado, precio_mxn, servicio_id, cliente_id"),
    sb.from("clientes").select("estado, total_citas, total_gastado_mxn, primera_cita_fecha"),
    sb.from("servicios").select("id, nombre"),
  ]);

  const citas = citasRes.data ?? [];
  const clientes = clientesRes.data ?? [];
  const servicios = serviciosRes.data ?? [];
  const servNameById: Record<string, string> = {};
  servicios.forEach((s) => { servNameById[s.id] = s.nombre; });

  // Ingresos por mes (últimos 12)
  const completadas = citas.filter((c) => c.estado === "completada");
  const ingresosPorMes: Record<string, { ingreso: number; citas: number }> = {};
  for (const c of completadas) {
    const ym = c.inicio.slice(0, 7);
    if (!ingresosPorMes[ym]) ingresosPorMes[ym] = { ingreso: 0, citas: 0 };
    ingresosPorMes[ym].ingreso += Number(c.precio_mxn);
    ingresosPorMes[ym].citas += 1;
  }
  const meses = Object.keys(ingresosPorMes).sort().slice(-12);
  const maxIngreso = Math.max(...meses.map((m) => ingresosPorMes[m].ingreso));

  // Top servicios por ingreso
  const ingresoPorServicio: Record<string, { ingreso: number; citas: number }> = {};
  for (const c of completadas) {
    const sid = c.servicio_id;
    if (!ingresoPorServicio[sid]) ingresoPorServicio[sid] = { ingreso: 0, citas: 0 };
    ingresoPorServicio[sid].ingreso += Number(c.precio_mxn);
    ingresoPorServicio[sid].citas += 1;
  }
  const topServicios = Object.entries(ingresoPorServicio)
    .sort((a, b) => b[1].ingreso - a[1].ingreso)
    .slice(0, 8);

  // Cohort de clientas: cuántas regresan
  const con1 = clientes.filter((c) => (c.total_citas ?? 0) >= 1).length;
  const con2 = clientes.filter((c) => (c.total_citas ?? 0) >= 2).length;
  const con5 = clientes.filter((c) => (c.total_citas ?? 0) >= 5).length;
  const con10 = clientes.filter((c) => (c.total_citas ?? 0) >= 10).length;

  // Estados
  const dormidas = clientes.filter((c) => c.estado === "dormida").length;
  const activas = clientes.filter((c) => c.estado === "activa").length;
  const totalLifetime = clientes.reduce((s, c) => s + Number(c.total_gastado_mxn ?? 0), 0);
  const ltvProm = con1 > 0 ? totalLifetime / con1 : 0;

  // Tasa de no-show
  const noShows = citas.filter((c) => c.estado === "no_show").length;
  const totalCompletadasONoShow = completadas.length + noShows;
  const tasaNoShow = totalCompletadasONoShow > 0 ? (noShows / totalCompletadasONoShow) * 100 : 0;

  // Mes actual vs mes pasado
  const ahora = new Date();
  const mesActualKey = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
  const mesPasadoDate = new Date(ahora.getFullYear(), ahora.getMonth() - 1);
  const mesPasadoKey = `${mesPasadoDate.getFullYear()}-${String(mesPasadoDate.getMonth() + 1).padStart(2, "0")}`;
  const ingMesActual = ingresosPorMes[mesActualKey]?.ingreso ?? 0;
  const ingMesPasado = ingresosPorMes[mesPasadoKey]?.ingreso ?? 0;
  const variacionPct = ingMesPasado > 0 ? ((ingMesActual - ingMesPasado) / ingMesPasado) * 100 : 0;

  return (
    <div className="max-w-6xl">
      <header className="mb-8">
        <p className="eyebrow">Insights del negocio</p>
        <h1 className="text-3xl mt-1">Reportes</h1>
      </header>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <BigStat label="Total facturado" value={fmtMxn(totalLifetime)} sub="histórico (3 años)" icon={<TrendingUp className="w-4 h-4" />} accent />
        <BigStat label="LTV promedio" value={fmtMxn(ltvProm)} sub="por clienta con citas" icon={<Award className="w-4 h-4" />} />
        <BigStat label="Retención" value={`${con1 > 0 ? Math.round(con2 / con1 * 100) : 0}%`} sub={`${con2} de ${con1} regresaron`} icon={<Heart className="w-4 h-4" />} />
        <BigStat label="No-shows" value={`${tasaNoShow.toFixed(1)}%`} sub={`${noShows} de ${totalCompletadasONoShow}`} icon={<Calendar className="w-4 h-4" />} />
      </div>

      {/* Mes en curso vs mes pasado */}
      <section className="mb-10 card">
        <p className="eyebrow mb-3">Performance del mes</p>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Mes actual</p>
            <p className="text-3xl font-bold">{fmtMxn(ingMesActual)}</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{ingresosPorMes[mesActualKey]?.citas ?? 0} citas</p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Mes pasado</p>
            <p className="text-3xl font-bold text-[var(--muted-foreground)]">{fmtMxn(ingMesPasado)}</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{ingresosPorMes[mesPasadoKey]?.citas ?? 0} citas</p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Variación</p>
            <p className={`text-3xl font-bold ${variacionPct >= 0 ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>
              {variacionPct >= 0 ? "+" : ""}{variacionPct.toFixed(0)}%
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">vs mes anterior</p>
          </div>
        </div>
      </section>

      {/* Ingresos por mes — chart estilo barras */}
      <section className="mb-10">
        <h2 className="text-lg mb-4">Ingresos últimos 12 meses</h2>
        <div className="card">
          <div className="space-y-2">
            {meses.map((m) => {
              const data = ingresosPorMes[m];
              const pct = (data.ingreso / maxIngreso) * 100;
              return (
                <div key={m} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-[var(--muted-foreground)] capitalize">{fmtMonthEs(m)}</div>
                  <div className="flex-1 h-7 bg-[var(--muted)] rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--secondary)] to-[var(--primary)] flex items-center justify-end pr-2 text-xs font-medium text-[var(--foreground)]"
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    >
                      {fmtMxn(data.ingreso)}
                    </div>
                  </div>
                  <div className="w-16 text-xs text-[var(--muted-foreground)] text-right">{data.citas} citas</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Top servicios */}
      <section className="mb-10">
        <h2 className="text-lg mb-4">Top servicios por ingreso</h2>
        <div className="card !p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="text-left px-4 py-2.5 font-medium">Servicio</th>
                <th className="text-right px-3 py-2.5 font-medium">Citas</th>
                <th className="text-right px-3 py-2.5 font-medium">Ingreso total</th>
                <th className="text-right px-4 py-2.5 font-medium">% del total</th>
              </tr>
            </thead>
            <tbody>
              {topServicios.map(([sid, data]) => {
                const pct = (data.ingreso / totalLifetime) * 100;
                return (
                  <tr key={sid} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium">{servNameById[sid] ?? "?"}</td>
                    <td className="px-3 py-2.5 text-sm text-right">{data.citas}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono">{fmtMxn(data.ingreso)}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-[var(--sage-deep)] font-medium">{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cohort de retención */}
      <section className="mb-10">
        <h2 className="text-lg mb-4">Cohort de retención</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CohortCard label="Con 1+ cita" count={con1} total={clientes.length} />
          <CohortCard label="Con 2+ citas" count={con2} total={con1} />
          <CohortCard label="Con 5+ citas" count={con5} total={con1} />
          <CohortCard label="Con 10+ citas (VIP)" count={con10} total={con1} accent />
        </div>
      </section>

      {/* Estado de la base */}
      <section>
        <h2 className="text-lg mb-4">Estado actual de tu base</h2>
        <div className="grid grid-cols-3 gap-3">
          <BigStat label="Activas" value={String(activas)} sub={`${Math.round(activas/clientes.length*100)}% de la base`} icon={<Heart className="w-4 h-4" />} />
          <BigStat label="Dormidas" value={String(dormidas)} sub="Listas para reactivar" icon={<Users className="w-4 h-4" />} />
          <BigStat label="Total registradas" value={String(clientes.length)} sub="En el CRM" icon={<Users className="w-4 h-4" />} />
        </div>
      </section>
    </div>
  );
}

function BigStat({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`card ${accent ? "bg-[var(--secondary)]/30 border-[var(--primary)]" : ""}`}>
      <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <p className="text-xs text-[var(--muted-foreground)] mt-1">{sub}</p>}
    </div>
  );
}

function CohortCard({ label, count, total, accent }: { label: string; count: number; total: number; accent?: boolean }) {
  const pct = total > 0 ? Math.round(count / total * 100) : 0;
  return (
    <div className={`card ${accent ? "bg-[var(--secondary)]/30 border-[var(--primary)]" : ""}`}>
      <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-2 font-medium">{label}</p>
      <p className="text-3xl font-bold">{count}</p>
      <p className="text-xs text-[var(--sage-deep)] mt-1">{pct}% conversión</p>
    </div>
  );
}
