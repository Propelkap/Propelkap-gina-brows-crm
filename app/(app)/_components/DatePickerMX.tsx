"use client";

/**
 * DatePickerMX — Date picker visual touch-friendly en formato MX (DD/MM/AAAA).
 *
 * - Input de texto editable + botón calendario que abre popover con grid.
 * - 100% determinista: se ve igual en Safari/Chrome/Edge desktop y móvil.
 * - Sin librerías externas (HTML/CSS puro).
 * - El usuario puede TIPEAR la fecha O elegir desde el calendario.
 *
 * Props:
 *   - value: YYYY-MM-DD string interno (ej. "2026-05-02"), "" si vacío
 *   - onChange: callback que recibe nueva YYYY-MM-DD
 *   - minDate?: YYYY-MM-DD inicio del rango disponible (default: hoy MX)
 *   - placeholder?: para el input cuando vacío (default: "DD/MM/AAAA")
 */
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { localYmd, parseFechaMX, fmtFechaMX } from "@/lib/date-helpers";

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_CORTOS = ["L", "M", "M", "J", "V", "S", "D"];

export default function DatePickerMX({
  value,
  onChange,
  minDate,
  placeholder = "DD/MM/AAAA",
  disabled = false,
}: {
  value: string;
  onChange: (ymd: string) => void;
  minDate?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [textInput, setTextInput] = useState(value ? fmtFechaMX(value) : "");
  // Mes/año visualmente mostrados en el calendario
  const [viewYear, setViewYear] = useState(() => {
    if (value) return parseInt(value.slice(0, 4), 10);
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return parseInt(value.slice(5, 7), 10) - 1;
    return new Date().getMonth();
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sincroniza textInput cuando cambia value externo
  useEffect(() => {
    setTextInput(value ? fmtFechaMX(value) : "");
    if (value) {
      setViewYear(parseInt(value.slice(0, 4), 10));
      setViewMonth(parseInt(value.slice(5, 7), 10) - 1);
    }
  }, [value]);

  // Cierra al click fuera
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function onTextChange(raw: string) {
    setTextInput(raw);
    const parsed = parseFechaMX(raw);
    if (parsed) onChange(parsed);
    else if (!raw.trim()) onChange("");
  }

  function pickDay(year: number, month: number, day: number) {
    const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(ymd);
    setTextInput(fmtFechaMX(ymd));
    setOpen(false);
  }

  // Construye el grid del mes actual
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  // En MX la semana empieza en Lunes. JS getDay: 0=Sun..6=Sat
  // Convertir a 0=Lun..6=Dom
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const cells: Array<{ day: number; isOther: boolean; year: number; month: number }> = [];
  // Días del mes anterior para llenar inicio
  if (firstWeekday > 0) {
    const prevLast = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = prevLast - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({ day: d, isOther: true, year: y, month: m });
    }
  }
  // Mes actual
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, isOther: false, year: viewYear, month: viewMonth });
  }
  // Llenar el resto hasta múltiplo de 7
  while (cells.length % 7 !== 0) {
    const lastCell = cells[cells.length - 1];
    const nextDay = lastCell.isOther ? lastCell.day + 1 : 1;
    if (lastCell.isOther) {
      cells.push({ day: nextDay, isOther: true, year: lastCell.year, month: lastCell.month });
    } else if (lastCell.day === totalDays) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({ day: 1, isOther: true, year: y, month: m });
    } else {
      cells.push({ day: nextDay, isOther: true, year: viewYear, month: viewMonth });
    }
  }

  const todayYmd = localYmd(new Date());
  const minYmd = minDate ?? todayYmd;
  const selectedYmd = value;

  function navMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-stretch gap-1.5">
        <input
          type="text"
          value={textInput}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="!flex-1"
          autoComplete="off"
          // SIN inputMode="numeric" — Gina necesita poder tipear "/" en mobile.
          // El boton del calendario es la via primaria; el input es alternativa
          // para typers rapidos.
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="px-3 rounded-xl border border-[var(--border)] bg-white hover:border-[var(--primary)]/60 hover:bg-[var(--secondary)]/15 transition-colors flex items-center justify-center"
          title="Abrir calendario"
          aria-label="Abrir calendario"
        >
          <Calendar className="w-4 h-4 text-[var(--primary-dark)]" />
        </button>
      </div>

      {textInput && !value && (
        <p className="text-[10px] text-[var(--destructive)] mt-1">
          Formato esperado: DD/MM/AAAA (ej. 02/05/2026)
        </p>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 left-0 bg-white rounded-2xl shadow-2xl border border-[var(--border)] p-3 w-[280px]">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => navMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-[var(--muted)]"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="!text-xs !py-1 !px-2 !w-auto"
              >
                {MESES_LARGOS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="!text-xs !py-1 !px-2 !w-auto"
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => navMonth(1)}
              className="p-1.5 rounded-lg hover:bg-[var(--muted)]"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DIAS_CORTOS.map((d, i) => (
              <div
                key={i}
                className="text-center text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium py-1"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              const cellYmd = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
              const isSelected = cellYmd === selectedYmd;
              const isToday = cellYmd === todayYmd;
              const isDisabled = cellYmd < minYmd;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => pickDay(cell.year, cell.month, cell.day)}
                  className={`
                    aspect-square text-xs rounded-lg flex items-center justify-center transition-all
                    ${cell.isOther ? "text-[var(--muted-foreground)]/50" : "text-[var(--foreground)]"}
                    ${isDisabled ? "opacity-30 cursor-not-allowed" : "hover:bg-[var(--secondary)]/30 active:scale-95"}
                    ${isSelected ? "!bg-[var(--primary-dark)] !text-white font-semibold" : ""}
                    ${isToday && !isSelected ? "ring-2 ring-[var(--primary)]/40" : ""}
                  `}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between mt-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => {
                onChange(todayYmd);
                setTextInput(fmtFechaMX(todayYmd));
                const t = new Date();
                setViewYear(t.getFullYear());
                setViewMonth(t.getMonth());
              }}
              className="text-[11px] text-[var(--primary-dark)] hover:underline px-2 py-1"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-2 py-1"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
