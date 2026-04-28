"use client";

import { useState } from "react";
import { Plus, Calendar, UserPlus } from "lucide-react";
import NuevaCitaModal from "./NuevaCitaModal";
import NuevaClientaModal from "./NuevaClientaModal";

export default function QuickActions() {
  const [open, setOpen] = useState(false);
  const [showCita, setShowCita] = useState(false);
  const [showClienta, setShowClienta] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {open && (
          <>
            <button
              onClick={() => { setShowCita(true); setOpen(false); }}
              className="bg-white border border-[var(--border)] shadow-lg rounded-full px-4 py-2.5 text-sm font-medium flex items-center gap-2 hover:bg-[var(--card)] transition-colors"
            >
              <Calendar className="w-4 h-4 text-[var(--primary-dark)]" />
              Nueva cita
            </button>
            <button
              onClick={() => { setShowClienta(true); setOpen(false); }}
              className="bg-white border border-[var(--border)] shadow-lg rounded-full px-4 py-2.5 text-sm font-medium flex items-center gap-2 hover:bg-[var(--card)] transition-colors"
            >
              <UserPlus className="w-4 h-4 text-[var(--primary-dark)]" />
              Nueva clienta
            </button>
          </>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full bg-[var(--secondary)] hover:bg-[var(--primary)] shadow-xl flex items-center justify-center transition-all"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0)" }}
          aria-label="Acciones rápidas"
        >
          <Plus className="w-6 h-6 text-[var(--foreground)]" />
        </button>
      </div>

      {showCita && <NuevaCitaModal onClose={() => setShowCita(false)} />}
      {showClienta && <NuevaClientaModal onClose={() => setShowClienta(false)} />}
    </>
  );
}
