import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCorreos } from "@/lib/roles";
export const dynamic = "force-dynamic";
/** Marketing y admin hacen todo; corporativo consulta. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerCorreos(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Correos" detalle="Campañas, contactos y estadísticas">{children}</Marco>;
}
