import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { esCorporativo } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function LayoutCorporativo({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!esCorporativo(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Corporativo" detalle="Todas las sucursales · solo lectura">{children}</Marco>;
}
