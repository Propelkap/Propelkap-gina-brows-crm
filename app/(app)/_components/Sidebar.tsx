"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Calendar, Users, MessageCircle, BarChart3, Sparkles, Settings, Heart, Send, Menu, X, Megaphone, Globe } from "lucide-react";
import LogoutButton from "./LogoutButton";

const ITEMS = [
  { href: "/", label: "Hoy", icon: Sparkles },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/clientas", label: "Clientas", icon: Users },
  { href: "/retencion", label: "Retención", icon: Heart },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/landing", label: "Mi Landing", icon: Globe },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export default function Sidebar({ email }: { email: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [path]);

  return (
    <>
      {/* Mobile top bar con hamburger */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-[var(--card)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-[var(--muted)]">
          <Menu className="w-5 h-5" />
        </button>
        <p className="font-semibold text-sm">Gina Brows</p>
        <div className="w-9" />
      </div>

      {/* Backdrop mobile */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-[hsl(149_20%_22%_/_0.5)] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen w-72 md:w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col z-50 transition-transform md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="px-6 py-7 border-b border-[var(--border)] flex items-start justify-between">
          <div>
            <p className="eyebrow mb-1">Gina Brows</p>
            <h1 className="text-xl">Microblading Artist</h1>
          </div>
          <button onClick={() => setOpen(false)} className="md:hidden p-1 -mr-2 rounded-lg hover:bg-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {ITEMS.map((item) => {
            const isActive = path === item.href || (item.href !== "/" && path.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--secondary)]/40 text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)] truncate px-3 mb-2">{email}</p>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
