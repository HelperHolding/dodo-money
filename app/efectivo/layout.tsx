import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerEfectivo } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Efectivo a corporativo vive fuera de (app): junta las salidas de todas las sucursales. */
export default async function LayoutEfectivo({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerEfectivo(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Efectivo" detalle="Salidas de todas las sucursales">{children}</Marco>;
}
