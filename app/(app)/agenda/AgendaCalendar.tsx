"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, MessageCircle, CalendarCheck, RefreshCw, AlertCircle } from "lucide-react";
import NuevaCitaModal from "../_components/NuevaCitaModal";
import GenerarConsentimientoBtn from "../_components/GenerarConsentimientoBtn";
import CheckoutCita from "../_components/CheckoutCita";
import CobrarCita from "../_components/CobrarCita";
import { localYmd as localYmdShared, buildLocalDate, parseFechaMX, fmtFechaMX, generarHorarios } from "@/lib/date-helpers";

const HORARIOS = generarHorarios(8, 22, 15);

type Cita = {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  precio_mxn: number;
  sesion_numero?: number | null;
  sesiones_totales?: number | null;
  notas_internas?: string | null;
  google_event_id?: string | null;
  calendar_synced_at?: string | null;
  cliente: { id: string; nombre: string; apellido: string | null; whatsapp: string | null } | null;
  servicio: { id: string; nombre: string; precio_mxn?: number; duracion_min?: number } | null;
};

const HOUR_START = 9;  // 9 AM
const HOUR_END = 21;   // 9 PM
const SLOT_MIN = 30;   // bloques de 30 min
const ROW_HEIGHT = 32; // px por slot
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Reexport para mantener API local del archivo; la implementacion vive en lib/date-helpers
const localYmd = localYmdShared;

const fmtMxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const ESTADO_BG: Record<string, string> = {
  completada: "bg-[var(--sage-light)] border-l-[var(--sage-deep)] text-[var(--sage-deep)]",
  no_show: "bg-[hsl(0_84%_60%_/_0.1)] border-l-[var(--destructive)] text-[var(--destructive)]",
  confirmada: "bg-[var(--secondary)]/40 border-l-[var(--primary-dark)] text-[var(--primary-dark)]",
  tentativa: "bg-[hsl(35_90%_55%_/_0.1)] border-l-[var(--warning)] text-[var(--warning)]",
  reagendada: "bg-[var(--muted)] border-l-[var(--muted-foreground)] text-[var(--muted-foreground)]",
};

export default function AgendaCalendar({
  citas,
  mondayYmd,
  todayYmd,
}: {
  citas: Cita[];
  mondayYmd: string;   // "YYYY-MM-DD" del lunes de la semana mostrada (en TZ MX)
  todayYmd: string;    // "YYYY-MM-DD" de hoy en TZ MX
}) {
  const router = useRouter();

  // Construir 'monday' como medianoche local del cliente para que getDate(),
  // toDateString() y demas reflejen el dia correcto sin saltos de TZ.
  const [my, mm, md] = mondayYmd.split("-").map(Number);
  const monday = new Date(my, mm - 1, md);

  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [showCitaModal, setShowCitaModal] = useState(false);
  const [activeCita, setActiveCita] = useState<Cita | null>(null);

  const slotsPorDia = ((HOUR_END - HOUR_START) * 60) / SLOT_MIN;
  const slots = Array.from({ length: slotsPorDia }, (_, i) => {
    const totalMin = HOUR_START * 60 + i * SLOT_MIN;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return { h, m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
  });

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Indexar citas por dia usando YMD LOCAL (no UTC) para que un cita de
  // las 9pm MX no se brinque al dia siguiente UTC.
  const citasPorDia = useMemo(() => {
    const map = new Map<string, Cita[]>();
    for (const c of citas) {
      const key = localYmd(new Date(c.inicio));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [citas]);

  function navWeek(diff: number) {
    const d = new Date(monday);
    d.setDate(d.getDate() + diff * 7);
    router.push(`/agenda?semana=${localYmd(d)}`);
  }

  function goToday() {
    router.push(`/agenda`);
  }

  function clickSlot(day: Date, slot: { h: number; m: number }) {
    const dt = new Date(day);
    dt.setHours(slot.h, slot.m, 0, 0);
    setSelectedSlot(dt);
    setShowCitaModal(true);
  }

  // Calcular posición top y altura de cada cita en píxeles
  function getCitaStyle(c: Cita) {
    const inicio = new Date(c.inicio);
    const fin = c.fin ? new Date(c.fin) : null;
    const minDesdeInicio = (inicio.getHours() - HOUR_START) * 60 + inicio.getMinutes();
    // Defensa: si fin es null, NaN, o anterior al inicio, fallback a la
    // duracion del servicio o 30 min. Sin esto el height sale negativo y
    // la cita se renderiza con altura 0 (invisible).
    let duracionMin: number;
    if (fin && !Number.isNaN(fin.getTime()) && fin.getTime() > inicio.getTime()) {
      duracionMin = (fin.getTime() - inicio.getTime()) / 60000;
    } else {
      duracionMin = c.servicio?.duracion_min ?? 30;
    }
    return {
      top: `${(minDesdeInicio / SLOT_MIN) * ROW_HEIGHT}px`,
      height: `${Math.max(20, (duracionMin / SLOT_MIN) * ROW_HEIGHT - 2)}px`,
    };
  }

  const labelMes = monday.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const labelRango = `${monday.getDate()} - ${dias[6].getDate()} ${dias[6].toLocaleDateString("es-MX", { month: "short" })}`;

  return (
    <div className="max-w-full">
      {/* Header con navegación */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow capitalize">{labelMes}</p>
          <h1 className="text-2xl md:text-3xl mt-1">Agenda · <span className="text-[var(--muted-foreground)] text-xl">{labelRango}</span></h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navWeek(-1)} className="btn-ghost !px-3"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={goToday} className="btn-ghost !text-xs">Hoy</button>
          <button onClick={() => navWeek(1)} className="btn-ghost !px-3"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => { setSelectedSlot(null); setShowCitaModal(true); }} className="btn-primary !text-xs ml-2">
            <Plus className="w-3.5 h-3.5" /> Cita
          </button>
        </div>
      </header>

      {/* Grid del calendario */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Encabezado de días */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)]">
              <div className="bg-[var(--card)]" />
              {dias.map((d, i) => {
                const esHoy = localYmd(d) === todayYmd;
                return (
                  <div key={i} className={`text-center py-3 border-l border-[var(--border)] ${esHoy ? "bg-[var(--secondary)]/20" : "bg-[var(--card)]"}`}>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{DAYS[i]}</p>
                    <p className={`text-lg font-semibold ${esHoy ? "text-[var(--primary-dark)]" : ""}`}>{d.getDate()}</p>
                  </div>
                );
              })}
            </div>

            {/* Cuerpo: grid de slots */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
              {/* Columna de horas */}
              <div>
                {slots.map((s, i) => (
                  <div key={i} className="text-[10px] text-[var(--muted-foreground)] text-right pr-2 border-b border-[var(--border)] flex items-start" style={{ height: ROW_HEIGHT }}>
                    {s.m === 0 ? s.label : ""}
                  </div>
                ))}
              </div>

              {/* 7 columnas de días */}
              {dias.map((d, dayIdx) => {
                const key = localYmd(d);
                const citasDelDia = citasPorDia.get(key) ?? [];
                const esHoy = localYmd(d) === todayYmd;
                return (
                  <div key={dayIdx} className={`relative border-l border-[var(--border)] ${esHoy ? "bg-[var(--secondary)]/5" : ""}`}>
                    {slots.map((s, slotIdx) => (
                      <button
                        key={slotIdx}
                        onClick={() => clickSlot(d, s)}
                        className={`block w-full border-b border-[var(--border)] hover:bg-[var(--secondary)]/15 transition-colors ${s.m === 0 ? "" : "border-dashed"}`}
                        style={{ height: ROW_HEIGHT }}
                      />
                    ))}
                    {/* Citas posicionadas absolutas */}
                    {citasDelDia.map((c) => {
                      const style = getCitaStyle(c);
                      const colors = ESTADO_BG[c.estado] ?? ESTADO_BG.tentativa;
                      const inicio = new Date(c.inicio);
                      const hora = inicio.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <button
                          key={c.id}
                          onClick={() => setActiveCita(c)}
                          className={`absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 text-[11px] leading-tight overflow-hidden text-left hover:shadow-md transition-shadow ${colors}`}
                          style={style}
                        >
                          <div className="font-semibold truncate">{c.cliente?.nombre} {c.cliente?.apellido}</div>
                          <div className="opacity-80 truncate">
                            {hora} · {c.servicio?.nombre}
                            {c.sesion_numero && c.sesiones_totales ? ` (${c.sesion_numero}/${c.sesiones_totales})` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
        <Legend label="Confirmada" color="bg-[var(--primary-dark)]" />
        <Legend label="Tentativa" color="bg-[var(--warning)]" />
        <Legend label="Completada" color="bg-[var(--sage-deep)]" />
        <Legend label="No asistió" color="bg-[var(--destructive)]" />
        <span className="ml-auto">Click en hueco vacío para crear cita · click en cita para ver detalle</span>
      </div>

      {/* Modal de nueva cita */}
      {showCitaModal && (
        <NuevaCitaModalConFecha
          onClose={() => { setShowCitaModal(false); setSelectedSlot(null); }}
          fechaInicial={selectedSlot}
        />
      )}

      {/* Drawer detalle de cita */}
      {activeCita && (
        <CitaDetalle cita={activeCita} onClose={() => setActiveCita(null)} />
      )}
    </div>
  );
}

function Legend({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

// Wrapper sobre NuevaCitaModal que pasa fecha inicial seleccionada del calendario
function NuevaCitaModalConFecha({ onClose, fechaInicial }: { onClose: () => void; fechaInicial: Date | null }) {
  // El modal Nueva Cita ya soporta selección manual de fecha; aquí solo abrimos con la fecha pre-elegida
  return <NuevaCitaModal onClose={onClose} fechaInicial={fechaInicial} />;
}

// Drawer flotante con detalle de cita seleccionada
function CitaDetalle({ cita, onClose }: { cita: Cita; onClose: () => void }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(cita.google_event_id ?? null);
  const [syncedAt, setSyncedAt] = useState<string | null>(cita.calendar_synced_at ?? null);
  const [editing, setEditing] = useState(false);
  const _inicioLocal = new Date(cita.inicio);
  const _horaInicial = `${String(_inicioLocal.getHours()).padStart(2, "0")}:${String(_inicioLocal.getMinutes()).padStart(2, "0")}`;
  const [editForm, setEditForm] = useState({
    fecha: localYmd(_inicioLocal),
    fechaInput: fmtFechaMX(localYmd(_inicioLocal)),
    hora: _horaInicial,
    precio_mxn: String(cita.precio_mxn),
    estado: cita.estado,
    notas_internas: cita.notas_internas ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const inicio = new Date(cita.inicio);
  const fmt = inicio.toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const wa = cita.cliente?.whatsapp;

  async function saveEdits() {
    setSaving(true);
    setEditError(null);
    const inicioDate = buildLocalDate(editForm.fecha, editForm.hora);
    if (!inicioDate) {
      setSaving(false);
      setEditError(`Fecha u hora inválida ("${editForm.fecha}" / "${editForm.hora}").`);
      return;
    }
    const inicioISO = inicioDate.toISOString();
    const duracionMin = cita.servicio?.duracion_min ?? 60;
    const finISO = new Date(inicioDate.getTime() + duracionMin * 60_000).toISOString();
    const res = await fetch(`/api/citas/${cita.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inicio: inicioISO,
        fin: finISO,
        precio_mxn: parseFloat(editForm.precio_mxn || "0"),
        estado: editForm.estado,
        notas_internas: editForm.notas_internas || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json();
      setEditError(j.error || "Error al guardar");
      return;
    }
    setEditing(false);
    router.refresh();
    onClose();
  }

  async function syncToCalendar() {
    setSyncing(true);
    setSyncError(null);
    const res = await fetch(`/api/citas/${cita.id}/sync-calendar`, { method: "POST" });
    const j = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setSyncError(j.hint || j.error || "Error al sincronizar");
      return;
    }
    setEventId(j.event_id);
    setSyncedAt(new Date().toISOString());
    router.refresh();
  }

  async function unsync() {
    if (!confirm("¿Quitar de Google Calendar? El evento NO se borra de tu calendario, solo desvinculamos del CRM.")) return;
    setSyncing(true);
    await fetch(`/api/citas/${cita.id}/sync-calendar`, { method: "DELETE" });
    setSyncing(false);
    setEventId(null);
    setSyncedAt(null);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(149_20%_22%_/_0.5)]" onClick={onClose}>
      <div
        className="absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-[var(--background)] shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="eyebrow !text-[var(--primary-dark)]">Detalle de cita</p>
              <h3 className="text-2xl mt-1">{cita.cliente?.nombre} {cita.cliente?.apellido}</h3>
            </div>
            <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl leading-none">×</button>
          </div>

          {!editing ? (
            <>
              <div className="space-y-3 mb-4">
                <Field label="Servicio" value={`${cita.servicio?.nombre ?? "—"}${cita.sesion_numero && cita.sesiones_totales ? ` (${cita.sesion_numero}/${cita.sesiones_totales})` : ""}`} />
                <Field label="Cuándo" value={fmt} />
                <Field label="Precio servicio principal" value={fmtMxn(Number(cita.precio_mxn))} />
                <Field label="Estado" value={cita.estado} />
                {cita.notas_internas && <Field label="Notas" value={cita.notas_internas} />}
                {wa && <Field label="WhatsApp" value={wa} mono />}
              </div>
              {/* Check-out: items extras consumidos */}
              <CheckoutCita citaId={cita.id} precioServicio={Number(cita.precio_mxn)} />
              {/* Cobro: metodos de pago + abonos + saldo */}
              <CobrarCita citaId={cita.id} />
              <button onClick={() => setEditing(true)} className="btn-ghost w-full justify-center my-4 !text-xs">
                ✏️ Editar cita
              </button>
            </>
          ) : (
            <div className="space-y-3 mb-4 bg-[var(--card)] p-4 rounded-xl border border-[var(--border)]">
              <p className="eyebrow !text-[var(--primary-dark)] mb-2">Editando cita</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Fecha</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editForm.fechaInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = parseFechaMX(raw);
                      setEditForm({ ...editForm, fechaInput: raw, fecha: parsed ?? "" });
                    }}
                    placeholder="DD/MM/AAAA"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Hora</label>
                  <select value={editForm.hora} onChange={(e) => setEditForm({ ...editForm, hora: e.target.value })}>
                    <option value="">— Selecciona —</option>
                    {HORARIOS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                    {/* Si la hora actual de la cita NO esta en HORARIOS (ej. 17:43 importada), agregarla */}
                    {!HORARIOS.includes(editForm.hora) && editForm.hora && (
                      <option value={editForm.hora}>{editForm.hora}</option>
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Estado</label>
                <select value={editForm.estado} onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })}>
                  <option value="tentativa">Pendiente</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="completada">Completada</option>
                  <option value="no_show">No asistió</option>
                  <option value="cancelada">Cancelada</option>
                  <option value="reagendada">Reagendada</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Precio MXN</label>
                <input type="number" value={editForm.precio_mxn} onChange={(e) => setEditForm({ ...editForm, precio_mxn: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium">Notas</label>
                <textarea rows={2} value={editForm.notas_internas} onChange={(e) => setEditForm({ ...editForm, notas_internas: e.target.value })} />
              </div>
              {editError && <p className="text-xs text-[var(--destructive)]">{editError}</p>}
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="btn-ghost flex-1 justify-center !text-xs">Cancelar</button>
                <button onClick={saveEdits} disabled={saving} className="btn-primary flex-1 justify-center !text-xs">
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          )}

          {/* Google Calendar sync */}
          <div className="mb-4 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CalendarCheck className={`w-4 h-4 ${eventId ? "text-[var(--sage-deep)]" : "text-[var(--muted-foreground)]"}`} />
                <span className="text-sm font-medium">Google Calendar</span>
              </div>
              {eventId ? (
                <span className="text-[10px] text-[var(--sage-deep)] uppercase tracking-wider font-semibold">Sincronizada</span>
              ) : (
                <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">No sincronizada</span>
              )}
            </div>
            {eventId && syncedAt && (
              <p className="text-xs text-[var(--muted-foreground)] mb-2">
                Sincronizada {new Date(syncedAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            {syncError && (
              <div className="text-xs text-[var(--destructive)] flex items-start gap-1.5 mb-2">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{syncError}</span>
              </div>
            )}
            <div className="flex gap-2">
              {eventId ? (
                <>
                  <button onClick={syncToCalendar} disabled={syncing} className="btn-ghost !text-xs flex-1 justify-center">
                    <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "..." : "Re-sincronizar"}
                  </button>
                  <button onClick={unsync} disabled={syncing} className="btn-ghost !text-xs text-[var(--muted-foreground)]">
                    Quitar
                  </button>
                </>
              ) : (
                <button onClick={syncToCalendar} disabled={syncing} className="btn-primary !text-xs w-full justify-center">
                  <CalendarCheck className="w-3.5 h-3.5" /> {syncing ? "Sincronizando..." : "Agregar a Google Calendar"}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {cita.cliente && (
              <GenerarConsentimientoBtn
                clienteId={cita.cliente.id}
                citaId={cita.id}
                clienteNombre={cita.cliente.nombre}
                clienteWhatsapp={wa}
              />
            )}
            <Link href={`/clientas/${cita.cliente?.id}`} className="btn-primary w-full justify-center">Abrir ficha completa</Link>
            {wa && (
              <a
                href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Hello, hello 🌿 ")}`}
                target="_blank" rel="noreferrer"
                className="btn-ghost w-full justify-center"
              >
                <MessageCircle className="w-4 h-4" /> Mandar WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium mb-0.5">{label}</p>
      <p className={`text-sm capitalize ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
