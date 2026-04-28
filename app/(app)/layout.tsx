import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "./_components/Sidebar";
import QuickActions from "./_components/QuickActions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ""} />
      <main className="flex-1 md:ml-64 px-4 md:px-8 pt-16 md:pt-6 pb-24 md:pb-6">
        {children}
      </main>
      <QuickActions />
    </div>
  );
}
