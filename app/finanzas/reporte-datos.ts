import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { elegirPeriodo } from "@/lib/finanzas/periodo";
import { INICIO_FECHA } from "@/lib/finanzas/pl";
import { puedeVerFinanzas } from "@/lib/roles";
import { comparativoPL, plConHistoria } from "./datos";
import { cuentasPL } from "./cuentasDatos";

export type FiltrosPL = { periodo?: string; mes?: string; semana?: string; sucursal?: string; vista?: string };

/** Lo que llevan el PDF y el Excel del P&L, con el mismo periodo y sucursal que la pantalla; `que` dice qué vistas cargar. */
export async function reportePL(q: FiltrosPL, que: { meta: boolean; comparativo: boolean; cuentas?: boolean }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const periodo = elegirPeriodo(q, hoyMX(), INICIO_FECHA);
  const [meta, comp, cuentas] = await Promise.all([
    que.meta ? plConHistoria(supabase, periodo, q.sucursal) : Promise.resolve(null),
    que.comparativo ? comparativoPL(supabase, periodo, q.sucursal) : Promise.resolve(null),
    que.cuentas ? cuentasPL(supabase, periodo, q.sucursal) : Promise.resolve(null),
  ]);
  return { periodo, generadoPor: perfil.nombre, titulo: cuentas?.titulo ?? meta?.titulo ?? comp?.titulo ?? "Consolidado", meta, comp, cuentas };
}
