"use client";

import { useEffect, useState } from "react";
import { Search, MessageCircle, Phone, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ChatPanel from "./ChatPanel";

type Conv = {
  cliente: { id: string; nombre: string; apellido: string | null; whatsapp: string | null; bot_pausado: boolean };
  ultimo: { id: string; cuerpo: string; enviado_at: string; direccion: string };
};

const fmtTimeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  if (min < 10080) return `${Math.floor(min / 1440)}d`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
};

export default function WhatsAppInbox({ conversaciones }: { conversaciones: Conv[] }) {
  const [activeId, setActiveId] = useState<string | null>(conversaciones[0]?.cliente.id ?? null);
  const [search, setSearch] = useState("");

  const filtered = conversaciones.filter((c) => {
    if (!search.trim()) return true;
    const full = `${c.cliente.nombre} ${c.cliente.apellido ?? ""}`.toLowerCase();
    return full.includes(search.toLowerCase()) || (c.cliente.whatsapp ?? "").includes(search);
  });

  const active = conversaciones.find((c) => c.cliente.id === activeId);

  if (conversaciones.length === 0) {
    return (
      <div className="max-w-2xl py-16">
        <div className="w-12 h-12 rounded-2xl bg-[var(--secondary)]/40 flex items-center justify-center mb-5 text-[var(--primary-dark)]">
          <MessageCircle className="w-6 h-6" />
        </div>
        <p className="eyebrow mb-2">Bandeja vacía</p>
        <h1 className="text-3xl mb-3">Aún no hay conversaciones</h1>
        <p className="text-[var(--muted-foreground)] leading-relaxed">
          Aquí aparecerán todas las conversaciones de WhatsApp con tus clientas en cuanto Twilio Business API esté activo (esta semana).
          Cada mensaje del bot tendrá thumbs 👍 / 👎 para que lo entrenes con tu voz.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3rem-3rem)] md:h-[calc(100vh-3rem)] -mx-4 md:-mx-8 -my-6 md:-my-6 flex">
      {/* Lista de conversaciones */}
      <div className={`${active ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 border-r border-[var(--border)] bg-[var(--card)]`}>
        <div className="p-4 border-b border-[var(--border)]">
          <h1 className="text-xl mb-3">WhatsApp</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Buscar conversación…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-10 !text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => {
            const nombre = `${c.cliente.nombre} ${c.cliente.apellido ?? ""}`.trim();
            const isActive = c.cliente.id === activeId;
            return (
              <button
                key={c.cliente.id}
                onClick={() => setActiveId(c.cliente.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--border)] transition-colors ${
                  isActive ? "bg-[var(--secondary)]/30" : "hover:bg-[var(--background)]"
                }`}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <p className="font-semibold text-sm truncate">{nombre}</p>
                  <span className="text-xs text-[var(--muted-foreground)] shrink-0 ml-2">{fmtTimeAgo(c.ultimo.enviado_at)}</span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] truncate">
                  {c.ultimo.direccion === "saliente" ? "Tú: " : ""}{c.ultimo.cuerpo}
                </p>
                {c.cliente.bot_pausado && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[var(--warning)] mt-1">
                    <AlertCircle className="w-2.5 h-2.5" /> Bot pausado
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat panel */}
      <div className={`${active ? "flex" : "hidden md:flex"} flex-1 flex-col bg-[var(--background)]`}>
        {active ? (
          <ChatPanel
            cliente={active.cliente}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)]">
            <div className="text-center">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecciona una conversación</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
