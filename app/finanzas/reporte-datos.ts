import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { elegirPeriodo } from "@/lib/finanzas/periodo";
import { INICIO_FECHA } from "@/lib/finanzas/pl";
import { puedeVerFinanzas } from "@/lib/roles";
import { plConHistoria } from "./datos";

/** Lo que llevan el PDF y el Excel del P&L, con el mismo periodo y sucursal que la pantalla. */
export async function reportePL(q: { periodo?: string; mes?: string; semana?: string; sucursal?: string }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const periodo = elegirPeriodo(q, hoyMX(), INICIO_FECHA);
  const r = await plConHistoria(supabase, periodo, q.sucursal);
  return {
    titulo: r.titulo, periodo, generadoPor: perfil.nombre, filas: r.filas, anterior: r.anterior, acumulado: r.acumulado,
    columnas: r.columnas, avisos: r.avisos, entrada: r.entrada,
  };
}
