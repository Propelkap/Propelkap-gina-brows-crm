"use client";

import { useState } from "react";
import { Check, XCircle, Clock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CitaActions({ citaId, estadoActual }: { citaId: string; estadoActual: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function update(estado: string) {
    setBusy(true);
    await fetch(`/api/citas/${citaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    setBusy(false);
    router.refresh();
  }

  if (estadoActual === "completada" || estadoActual === "cancelada") {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <button
        onClick={() => update("completada")}
        disabled={busy}
        className="text-xs inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--sage-light)] text-[var(--sage-deep)] hover:bg-[var(--sage)] transition-colors"
      >
        <Check className="w-3 h-3" /> Marcar asistió
      </button>
      <button
        onClick={() => update("no_show")}
        disabled={busy}
        className="text-xs inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[hsl(0_84%_60%_/_0.1)] text-[var(--destructive)] hover:bg-[hsl(0_84%_60%_/_0.2)] transition-colors"
      >
        <XCircle className="w-3 h-3" /> No asistió
      </button>
      <button
        onClick={() => update("confirmada")}
        disabled={busy || estadoActual === "confirmada"}
        className="text-xs inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--secondary)]/40 text-[var(--primary-dark)] hover:bg-[var(--secondary)]/70 transition-colors disabled:opacity-40"
      >
        <Clock className="w-3 h-3" /> Confirmar
      </button>
      <button
        onClick={() => update("cancelada")}
        disabled={busy}
        className="text-xs inline-flex items-center gap-1 px-3 py-1 rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      >
        <Trash2 className="w-3 h-3" /> Cancelar cita
      </button>
    </div>
  );
}
