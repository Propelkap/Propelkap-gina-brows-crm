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

// Branding dinámico via ENV vars (cada cliente sobrescribe en Vercel):
//   NEXT_PUBLIC_BRAND_LABEL_TOP    → "PropelKap × Haydeé" (uppercase tracking)
//   NEXT_PUBLIC_BRAND_LABEL_BOTTOM → "Pensiones y Asesoría" (h1 grande)
//   NEXT_PUBLIC_BRAND_MOBILE       → "Haydeé Pensiones" (en mobile top bar)
const BRAND_TOP = process.env.NEXT_PUBLIC_BRAND_LABEL_TOP ?? "PropelKap × Haydeé";
const BRAND_BOTTOM = process.env.NEXT_PUBLIC_BRAND_LABEL_BOTTOM ?? "Pensiones y Asesoría";
const BRAND_MOBILE = process.env.NEXT_PUBLIC_BRAND_MOBILE ?? "Haydeé Pensiones";

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
        <p className="font-semibold text-sm">{BRAND_MOBILE}</p>
        <div className="w-9" />
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-[hsl(218_50%_12%_/_0.5)] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/*
        Sidebar usa CSS vars overridables por cada cliente:
          --sidebar-bg          (default: var(--navy-deep))
          --sidebar-border      (default: var(--navy-soft))
          --sidebar-text        (default: var(--background))
          --sidebar-text-muted  (default: hsl(220 20% 82%) → claro sobre navy)
          --sidebar-accent      (default: var(--lime))
          --sidebar-accent-fg   (default: var(--navy-deep))
        Ver app/globals.css del cliente para sobrescribir según paleta.
      */}
      <aside
        className={`fixed left-0 top-0 h-screen w-72 md:w-64 bg-[var(--sidebar-bg,var(--navy-deep))] border-r border-[var(--sidebar-border,var(--navy-soft))] flex flex-col z-50 transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-7 border-b border-[var(--sidebar-border,var(--navy-soft))] flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--sidebar-accent,var(--lime))] flex items-center justify-center text-[var(--sidebar-accent-fg,var(--navy-deep))] shrink-0 mt-0.5">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-[var(--sidebar-accent,var(--lime))] font-semibold mb-0.5">
                {BRAND_TOP}
              </p>
              <h1 className="text-base text-[var(--sidebar-text,var(--background))] leading-tight">
                {BRAND_BOTTOM}
              </h1>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden p-1 -mr-2 rounded-lg hover:bg-[var(--sidebar-border,var(--navy-soft))] text-[var(--sidebar-text,var(--background))]"
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
                    ? "bg-[var(--sidebar-accent,var(--lime))] text-[var(--sidebar-accent-fg,var(--navy-deep))]"
                    : "text-[var(--sidebar-text-muted,hsl(220_20%_82%))] hover:bg-[var(--sidebar-border,var(--navy-soft))] hover:text-[var(--sidebar-text,var(--background))]"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-[var(--sidebar-border,var(--navy-soft))]">
          <p className="text-xs text-[var(--sidebar-text-muted,hsl(220_20%_72%))] truncate px-3 mb-2">{email}</p>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
