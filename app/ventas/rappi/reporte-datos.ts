import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeVerVentas, veVentasDeTodas } from "@/lib/roles";
import { periodoElegido, type Periodo } from "@/lib/ventas/calculos";
import { ordenesDesdeDodo } from "@/lib/ventas/rappi";
import { ordenesReporteRappi, type OrdenReporteRappi } from "@/lib/ventas/reporteRappi";
import { cargarPedidosAgregadorDodo, cargarRappi } from "./datos";

export type ReporteRappi = { titulo: string; periodo: Periodo; generadoPor: string; ordenes: OrdenReporteRappi[] };

/** Nombre del .xlsx con la sucursal y el periodo, sin caracteres que Windows no acepta. */
export const nombreArchivoRappi = (titulo: string, p: Periodo) =>
  `Ventas Rappi ${titulo.replace(/[\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()} ${p.desde} a ${p.hasta}.xlsx`;

/**
 * Lo que llevan el PDF y el Excel de Ventas → Rappi, con el mismo periodo y sucursal de la página: las órdenes en vivo del
 * portal (todas, con su estado) y los pedidos de agregador de Dodo IS de los días en que Dodo IS es la fuente.
 */
export async function datosReporteRappi(q: { desde?: string; hasta?: string; sucursal?: string }): Promise<ReporteRappi> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerVentas(perfil.rol)) redirect("/");
  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const nombreDe = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const sucursal = veVentasDeTodas(perfil.rol) ? (q.sucursal && nombreDe.has(q.sucursal) ? q.sucursal : null) : perfil.sucursal_id;

  const hoy = hoyCalendarioMX(), mes = hoy.slice(0, 7);
  const finMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const periodo = periodoElegido(q.desde, q.hasta, { desde: `${mes}-01`, hasta: finMes < hoy ? finMes : hoy });
  const [{ ordenes }, dodo] = await Promise.all([
    cargarRappi(supabase, sucursal, periodo.desde, periodo.hasta),
    cargarPedidosAgregadorDodo(supabase, sucursal, periodo.desde, periodo.hasta),
  ]);
  return {
    titulo: sucursal ? nombreDe.get(sucursal) ?? "Sucursal" : "Todas las sucursales",
    periodo, generadoPor: perfil.nombre,
    ordenes: ordenesReporteRappi([...ordenes, ...ordenesDesdeDodo(dodo)], (id) => nombreDe.get(id) ?? id),
  };
}
