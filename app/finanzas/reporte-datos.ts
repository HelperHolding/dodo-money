import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerFinanzas } from "@/lib/roles";
import { mesElegido, plConHistoria } from "./datos";

/** Lo que llevan el PDF y el Excel del P&L, con el mismo mes y sucursal que la pantalla. */
export async function reportePL(q: { mes?: string; sucursal?: string }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const mes = mesElegido(q.mes);
  const r = await plConHistoria(supabase, mes, q.sucursal);
  return { titulo: r.titulo, mes, generadoPor: perfil.nombre, filas: r.filas, anterior: r.anterior, acumulado: r.acumulado, avisos: r.avisos, entrada: r.entrada };
}
