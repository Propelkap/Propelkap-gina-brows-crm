/**
 * Página pública (sin auth) que la clienta abre desde iPad para firmar el consentimiento.
 * URL: /consentimiento/[token]
 */
import ConsentimientoForm from "./ConsentimientoForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consentimiento · Gina Brows",
  description: "Por favor llena este formulario antes de tu tratamiento.",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConsentimientoForm token={token} />;
}
