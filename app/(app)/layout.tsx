import Link from "next/link";
import { Calendar, Users, MessageCircle, BarChart3, Sparkles, Settings, Heart, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "./_components/LogoutButton";
import QuickActions from "./_components/QuickActions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ""} />
      <main className="flex-1 ml-64 px-8 py-6">{children}</main>
      <QuickActions />
    </div>
  );
}

function Sidebar({ email }: { email: string }) {
  const items = [
    { href: "/", label: "Hoy", icon: Sparkles },
    { href: "/agenda", label: "Agenda", icon: Calendar },
    { href: "/clientas", label: "Clientas", icon: Users },
    { href: "/retencion", label: "Retención", icon: Heart },
    { href: "/campanias", label: "Campañas", icon: Send },
    { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
    { href: "/reportes", label: "Reportes", icon: BarChart3 },
    { href: "/configuracion", label: "Configuración", icon: Settings },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col">
      <div className="px-6 py-7 border-b border-[var(--border)]">
        <p className="eyebrow mb-1">Gina Brows</p>
        <h1 className="text-xl">Microblading Artist</h1>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted-foreground)] truncate px-3 mb-2">{email}</p>
        <LogoutButton />
      </div>
    </aside>
  );
}
