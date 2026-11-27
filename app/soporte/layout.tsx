import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
export const dynamic = "force-dynamic";
/** Todos los puestos entran: cada quien ve sus tickets; soporte (admin) atiende todos. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  return <Marco perfil={perfil} titulo="Help Desk" detalle="Problemas y mejoras del sistema">{children}</Marco>;
}
