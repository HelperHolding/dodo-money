import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { esCorporativo, puedeVerVistaGeneral } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function LayoutCorporativo({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerVistaGeneral(perfil.rol)) redirect("/");
  return esCorporativo(perfil.rol)
    ? <Marco perfil={perfil} titulo="Corporativo" detalle="Todas las sucursales · solo lectura">{children}</Marco>
    : <Marco perfil={perfil} titulo="Vista general" detalle="Todas las sucursales · elige dónde operar">{children}</Marco>;
}
