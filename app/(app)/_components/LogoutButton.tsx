"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
      }}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Salir
    </button>
  );
}
