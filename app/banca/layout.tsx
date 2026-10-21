import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerFinanzas } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function LayoutBanca({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Banca" detalle="Bancos y plataformas · vista preliminar">{children}</Marco>;
}
