import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerVentas } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Ventas vive fuera de (app): admin y corporativo ven todas las sucursales, no una elegida. */
export default async function LayoutVentas({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerVentas(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Ventas" detalle="Dodo IS y Rappi">{children}</Marco>;
}
