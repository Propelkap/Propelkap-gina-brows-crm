import Link from "next/link";
import { Construction } from "lucide-react";

export default function Stub({ title, description, eta }: { title: string; description: string; eta: string }) {
  return (
    <div className="max-w-2xl py-16">
      <div className="w-12 h-12 rounded-2xl bg-[var(--secondary)]/40 flex items-center justify-center mb-5 text-[var(--primary-dark)]">
        <Construction className="w-6 h-6" />
      </div>
      <p className="eyebrow mb-2">En construcción</p>
      <h1 className="text-3xl mb-3">{title}</h1>
      <p className="text-[var(--muted-foreground)] leading-relaxed mb-6">{description}</p>
      <p className="text-sm text-[var(--sage-deep)]"><strong>Disponible:</strong> {eta}</p>
      <Link href="/" className="btn-ghost mt-8">← Volver al dashboard</Link>
    </div>
  );
}
