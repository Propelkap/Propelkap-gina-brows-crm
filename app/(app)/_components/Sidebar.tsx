"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  PhoneCall,
  MessageCircle,
  BarChart3,
  Settings,
  Send,
  Menu,
  X,
  Megaphone,
  Briefcase,
  Globe,
} from "lucide-react";
import LogoutButton from "./LogoutButton";

const ITEMS = [
  { href: "/", label: "Hoy", icon: LayoutDashboard },
  { href: "/prospectos", label: "Prospectos", icon: Users },
  { href: "/contactos", label: "Contactos", icon: UserPlus },
  { href: "/asesorias", label: "Asesorías", icon: PhoneCall },
  { href: "/reactivacion", label: "Reactivación", icon: Send },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/landing", label: "Mi Landing", icon: Globe },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export default function Sidebar({ email }: { email: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <>
      {/* Mobile top bar con hamburger */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-[var(--card)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-[var(--muted)]">
          <Menu className="w-5 h-5" />
        </button>
        <p className="font-semibold text-sm">Haydeé Pensiones</p>
        <div className="w-9" />
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-[hsl(218_50%_12%_/_0.5)] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-72 md:w-64 bg-[var(--navy-deep)] border-r border-[var(--navy-soft)] flex flex-col z-50 transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-7 border-b border-[var(--navy-soft)] flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--lime)] flex items-center justify-center text-[var(--navy-deep)] shrink-0 mt-0.5">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-[var(--lime)] font-semibold mb-0.5">
                PropelKap × Haydeé
              </p>
              <h1 className="text-base text-[var(--background)] leading-tight">
                Pensiones y Asesoría
              </h1>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden p-1 -mr-2 rounded-lg hover:bg-[var(--navy-soft)] text-[var(--background)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {ITEMS.map((item) => {
            const isActive =
              path === item.href || (item.href !== "/" && path.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--lime)] text-[var(--navy-deep)]"
                    : "text-[hsl(220_20%_82%)] hover:bg-[var(--navy-soft)] hover:text-[var(--background)]"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-[var(--navy-soft)]">
          <p className="text-xs text-[hsl(220_20%_72%)] truncate px-3 mb-2">{email}</p>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
