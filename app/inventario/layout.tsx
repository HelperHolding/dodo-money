import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCompras } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Inventario: insumos de Dodo IS (en vivo) y artículos del almacén. Admin y corporativo. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Inventario" detalle="Insumos de Dodo IS y almacén de uniformes">{children}</Marco>;
}
