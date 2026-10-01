import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras, puedeVerCompras } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Compras vive fuera de (app): es de oficina central, no de una sucursal. */
export default async function LayoutCompras({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  return (
    <Marco perfil={perfil} titulo="Compras" detalle={puedeEditarCompras(perfil.rol) ? "Oficina central" : "Oficina central · solo lectura"}>
      {children}
    </Marco>
  );
}
