import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Calendar, Clock, MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const ESTADO_BADGES: Record<string, string> = {
  completada: "bg-[var(--sage-light)] text-[var(--sage-deep)]",
  no_show: "bg-[hsl(0_84%_60%_/_0.1)] text-[var(--destructive)]",
  cancelada: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  confirmada: "bg-[var(--secondary)]/40 text-[var(--primary-dark)]",
  tentativa: "bg-[hsl(35_90%_55%_/_0.15)] text-[var(--warning)]",
};

const ESTADO_LABELS: Record<string, string> = {
  completada: "Completada",
  no_show: "No asistió",
  cancelada: "Cancelada",
  confirmada: "Confirmada",
  tentativa: "Pendiente",
};

export default async function AgendaPage() {
  const supabase = await createClient();
  const ahora = new Date().toISOString();

  const [proxRes, recRes] = await Promise.all([
    supabase
      .from("citas")
      .select("id, inicio, fin, estado, precio_mxn, cliente:clientes(id, nombre, apellido, whatsapp), servicio:servicios(nombre)")
      .gte("inicio", ahora)
      .neq("estado", "cancelada")
      .order("inicio", { ascending: true })
      .limit(50),
    supabase
      .from("citas")
      .select("id, inicio, estado, precio_mxn, cliente:clientes(id, nombre, apellido), servicio:servicios(nombre)")
      .lt("inicio", ahora)
      .order("inicio", { ascending: false })
      .limit(20),
  ]);

  const proximas = proxRes.data ?? [];
  const recientes = recRes.data ?? [];

  // Agrupar próximas por día
  const grupos = new Map<string, typeof proximas>();
  for (const c of proximas) {
    const d = new Date(c.inicio).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d)!.push(c);
  }

  return (
    <div className="max-w-5xl">
      <header className="mb-8">
        <p className="eyebrow">Próximas citas + histórico reciente</p>
        <h1 className="text-3xl mt-1">Agenda</h1>
      </header>

      {/* Próximas */}
      <section className="mb-10">
        <h2 className="text-lg mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Próximas ({proximas.length})
        </h2>

        {proximas.length === 0 ? (
          <div className="card text-center py-12 text-[var(--muted-foreground)] text-sm">
            No hay citas futuras programadas.
          </div>
        ) : (
          <div className="space-y-6">
            {[...grupos.entries()].map(([dia, citas]) => (
              <div key={dia}>
                <h3 className="text-xs uppercase tracking-wider text-[var(--sage-deep)] font-medium mb-2 capitalize">{dia}</h3>
                <div className="space-y-2">
                  {citas.map((c: any) => {
                    const hora = new Date(c.inicio).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
                    const horaFin = new Date(c.fin).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
                    const wa = c.cliente?.whatsapp;
                    return (
                      <div key={c.id} className="card flex items-center gap-4 !py-3">
                        <div className="text-center min-w-[60px]">
                          <p className="text-lg font-semibold">{hora}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{horaFin}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link href={`/clientas/${c.cliente?.id}`} className="font-medium hover:underline">
                            {c.cliente?.nombre} {c.cliente?.apellido}
                          </Link>
                          <p className="text-sm text-[var(--muted-foreground)]">{c.servicio?.nombre}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{fmtMxn(Number(c.precio_mxn))}</p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGES[c.estado]}`}>
                            {ESTADO_LABELS[c.estado]}
                          </span>
                        </div>
                        {wa && (
                          <a
                            href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Hello, hello 🌿 ")}`}
                            target="_blank" rel="noreferrer"
                            className="text-[var(--primary-dark)] hover:text-[var(--foreground)]"
                            title="WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recientes */}
      <section>
        <h2 className="text-lg mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Recientes (últimas 20)
        </h2>
        <div className="card !p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                <th className="text-left px-3 py-2.5 font-medium">Clienta</th>
                <th className="text-left px-3 py-2.5 font-medium">Servicio</th>
                <th className="text-left px-3 py-2.5 font-medium">Estado</th>
                <th className="text-right px-4 py-2.5 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {recientes.map((c: any) => (
                <tr key={c.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40">
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                    {new Date(c.inicio).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })}
                  </td>
                  <td className="px-3 py-2.5 text-sm">
                    <Link href={`/clientas/${c.cliente?.id}`} className="hover:underline">
                      {c.cliente?.nombre} {c.cliente?.apellido}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-[var(--muted-foreground)]">{c.servicio?.nombre}</td>
                  <td className="px-3 py-2.5 text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGES[c.estado]}`}>
                      {ESTADO_LABELS[c.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right font-mono">{fmtMxn(Number(c.precio_mxn))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
