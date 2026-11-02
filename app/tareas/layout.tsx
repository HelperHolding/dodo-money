import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
export const dynamic = "force-dynamic";
/** Todos los puestos entran: cada quien ve sus tareas (la base decide qué). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  return <Marco perfil={perfil} titulo="Tareas" detalle="Pendientes y seguimiento">{children}</Marco>;
}
