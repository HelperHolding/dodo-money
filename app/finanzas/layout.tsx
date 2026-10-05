import { redirect } from "next/navigation";
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas, puedeVerFinanzas } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Finanzas: P&L, nómina, gastos del mes y parámetros. Admin captura; corporativo consulta. */
export default async function LayoutFinanzas({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  return <Marco perfil={perfil} titulo="Finanzas" detalle={puedeEditarFinanzas(perfil.rol) ? "Todas las sucursales" : "Todas las sucursales · solo lectura"}>{children}</Marco>;
}
