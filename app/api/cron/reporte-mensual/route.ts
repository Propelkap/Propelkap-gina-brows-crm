/**
 * Cron mensual · dia 1 de cada mes a las 9 AM Monterrey (15:00 UTC).
 *
 * Calcula KPIs del MES ANTERIOR y manda email branded a Gina con el
 * resumen + link al dashboard de reportes.
 *
 * KPIs incluidos:
 *   - Citas totales / completadas / no_show / canceladas
 *   - Ingresos totales (sum de precio_mxn de citas completadas)
 *   - Ticket promedio
 *   - Top 5 servicios mas vendidos
 *   - Clientas nuevas registradas
 *   - Tasa de retencion (clientas con >= 2 citas en el mes)
 */
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { assertCronAuth, addDaysYmd, todayYmdMX, TZ_OFFSET } from "@/lib/cron-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const MES_NOMBRE = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export async function GET(req: Request) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  // Calcular el mes anterior en TZ MX
  const hoy = todayYmdMX(); // "YYYY-MM-DD"
  const [y, m] = hoy.split("-").map(Number);
  const mesAnt = m === 1 ? 12 : m - 1;
  const yMesAnt = m === 1 ? y - 1 : y;
  const inicioMesYmd = `${yMesAnt}-${String(mesAnt).padStart(2, "0")}-01`;
  // Primer dia del mes actual = fin del rango (exclusive)
  const inicioMesActualYmd = `${y}-${String(m).padStart(2, "0")}-01`;
  const inicioISO = `${inicioMesYmd}T00:00:00${TZ_OFFSET}`;
  const finISO = `${inicioMesActualYmd}T00:00:00${TZ_OFFSET}`;

  const sb = createServiceClient();

  // ===== Citas del mes =====
  const { data: citas } = await sb
    .from("citas")
    .select("id, estado, precio_mxn, cliente_id, servicio_id, servicio:servicios(nombre)")
    .gte("inicio", inicioISO)
    .lt("inicio", finISO);

  const total = citas?.length ?? 0;
  let completadas = 0, noShow = 0, canceladas = 0, ingresos = 0;
  const porServicio = new Map<string, { nombre: string; n: number; mxn: number }>();
  const clientesUnicosMes = new Set<string>();
  const clientesConCitas = new Map<string, number>();

  for (const c of (citas ?? []) as any[]) {
    if (c.estado === "completada") {
      completadas++;
      ingresos += Number(c.precio_mxn || 0);
      const sNombre = (Array.isArray(c.servicio) ? c.servicio[0] : c.servicio)?.nombre ?? "Otro";
      const cur = porServicio.get(c.servicio_id ?? "_") ?? { nombre: sNombre, n: 0, mxn: 0 };
      cur.n++;
      cur.mxn += Number(c.precio_mxn || 0);
      porServicio.set(c.servicio_id ?? "_", cur);
    } else if (c.estado === "no_show") noShow++;
    else if (c.estado === "cancelada") canceladas++;

    if (c.cliente_id) {
      clientesUnicosMes.add(c.cliente_id);
      clientesConCitas.set(c.cliente_id, (clientesConCitas.get(c.cliente_id) ?? 0) + 1);
    }
  }

  const ticketPromedio = completadas > 0 ? ingresos / completadas : 0;
  const tasaNoShow = total > 0 ? (noShow / total) * 100 : 0;
  const recurrentes = [...clientesConCitas.values()].filter((n) => n >= 2).length;

  const topServicios = [...porServicio.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);

  // ===== Clientas nuevas =====
  const { count: nuevas } = await sb
    .from("clientes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", inicioISO)
    .lt("created_at", finISO);

  // ===== Email branded =====
  const mesLabel = `${MES_NOMBRE[mesAnt - 1]} ${yMesAnt}`;
  const html = renderHtml({
    mesLabel,
    total, completadas, noShow, canceladas,
    ingresos, ticketPromedio, tasaNoShow,
    clientasNuevas: nuevas ?? 0,
    clientasUnicas: clientesUnicosMes.size,
    recurrentes,
    topServicios,
  });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY no configurado" }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const to = process.env.REPORTE_MENSUAL_TO ?? "gtorres@ginabrows.com";
  const from = process.env.RESEND_FROM ?? "Gina Brows <hola@ginabrows.com>";

  const r = await resend.emails.send({
    from,
    to: [to],
    replyTo: "jpbriones@propelkap.com",
    subject: `🌿 Reporte ${mesLabel} · Gina Brows`,
    html,
  });

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    mes: mesLabel,
    kpis: { total, completadas, ingresos, ticketPromedio, clientasNuevas: nuevas ?? 0 },
    email: { to, status: r.error ? "failed" : "sent", error: r.error?.message ?? null },
  });
}

function renderHtml(d: {
  mesLabel: string;
  total: number; completadas: number; noShow: number; canceladas: number;
  ingresos: number; ticketPromedio: number; tasaNoShow: number;
  clientasNuevas: number; clientasUnicas: number; recurrentes: number;
  topServicios: { nombre: string; n: number; mxn: number }[];
}): string {
  const card = (label: string, value: string, hint?: string) => `
    <td style="padding:14px;border:1px solid #e5e0d6;border-radius:12px;background:#fcf8ed;width:33%;vertical-align:top;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#7a8175;font-weight:500;">${label}</div>
      <div style="font-size:20px;font-weight:700;color:#2d3d33;margin-top:4px;">${value}</div>
      ${hint ? `<div style="font-size:11px;color:#9a9a8e;margin-top:2px;">${hint}</div>` : ""}
    </td>`;

  const topRows = d.topServicios.length
    ? d.topServicios.map((s, i) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e0d6;font-size:13px;">${i + 1}. ${s.nombre}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e0d6;font-size:13px;text-align:right;color:#7a8175;">${s.n} cita${s.n !== 1 ? "s" : ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e0d6;font-size:13px;text-align:right;font-weight:600;">${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(s.mxn)}</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:20px;text-align:center;color:#9a9a8e;">Sin servicios completados este mes</td></tr>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,sans-serif;background:#fcf8ed;margin:0;padding:24px;color:#2d3d33;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 2px 12px rgba(45,61,51,0.08);">
    <div style="padding:32px 28px 24px 28px;border-bottom:1px solid #e5e0d6;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#cec1e0;font-weight:600;">Reporte mensual</div>
      <h1 style="margin:6px 0 0 0;font-size:28px;color:#2d3d33;font-weight:700;text-transform:capitalize;">${d.mesLabel}</h1>
      <p style="margin:8px 0 0 0;color:#7a8175;font-size:14px;">Resumen de tu mes en Gina Brows.</p>
    </div>

    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:separate;border-spacing:8px;">
        <tr>
          ${card("Citas totales", String(d.total))}
          ${card("Completadas", String(d.completadas), `${d.completadas > 0 ? Math.round((d.completadas / d.total) * 100) : 0}% del total`)}
          ${card("Ingresos", new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(d.ingresos))}
        </tr>
        <tr>
          ${card("Ticket promedio", new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(d.ticketPromedio))}
          ${card("Clientas nuevas", String(d.clientasNuevas))}
          ${card("No-show", `${d.tasaNoShow.toFixed(1)}%`, `${d.noShow} citas`)}
        </tr>
      </table>
    </div>

    <div style="padding:0 28px 24px 28px;">
      <h2 style="font-size:16px;color:#2d3d33;margin:24px 0 12px 0;">Top 5 servicios del mes</h2>
      <table style="width:100%;border-collapse:collapse;background:#fcf8ed;border-radius:12px;overflow:hidden;">
        ${topRows}
      </table>
    </div>

    <div style="padding:0 28px 24px 28px;">
      <h2 style="font-size:16px;color:#2d3d33;margin:24px 0 12px 0;">Clientas únicas</h2>
      <p style="font-size:14px;color:#7a8175;margin:0;">
        <strong style="color:#2d3d33;">${d.clientasUnicas}</strong> clientas distintas tuvieron cita.
        <strong style="color:#2d3d33;">${d.recurrentes}</strong> volvieron 2+ veces este mes.
      </p>
    </div>

    <div style="padding:24px 28px;border-top:1px solid #e5e0d6;background:#fcf8ed;text-align:center;">
      <a href="https://gina-brows-crm.vercel.app/reportes" style="display:inline-block;background:#cec1e0;color:#2d3d33;padding:10px 20px;border-radius:24px;text-decoration:none;font-weight:600;font-size:13px;">
        Ver reporte completo en el CRM →
      </a>
    </div>

    <div style="padding:16px 28px;background:#fcf8ed;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9a9a8e;">
        Generado automáticamente por tu CRM ✨ · ${d.mesLabel}
      </p>
    </div>
  </div>
</body></html>`;
}
