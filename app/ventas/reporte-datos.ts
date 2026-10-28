import {datosGraficasReporte} from "./graficas-reporte-datos";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerVentas, veVentasDeTodas } from "@/lib/roles";
import { costeo, periodoAnterior, periodoElegido, resumenVentas, type Periodo } from "@/lib/ventas/calculos";
import { periodosRapidos } from "@/lib/ventas/calendario";
import { hoyMX } from "@/lib/formato";
import { filasPorDia, renglonesResumen, type FilaDia, type RenglonResumen,type CanalReporte } from "@/lib/ventas/reporte";
import { datosVentas, sucursalElegida, ultimoDiaConDatos,type CanalesVentas } from "./datos";

export type ReporteVentas = {
  titulo: string; periodo: Periodo; generadoPor: string; resumen: RenglonResumen[]; dias: FilaDia[];
  canales:CanalReporte[];
  graficas:Awaited<ReturnType<typeof datosGraficasReporte>>;
};
export function reporteCanales(actual:CanalesVentas,anterior:CanalesVentas):CanalReporte[]{
  const resumen=(c:CanalesVentas["pos"])=>{const s=resumenVentas(c.dias);return{total:s.total,neta:s.neta,iva:s.iva,pedidos:s.pedidos,ticket:s.ticket,costoPct:costeo(c.renglones).total.costoPct};};
  return (["pos","rappi"] as const).map(clave=>({clave,nombre:clave==="pos"?"POS / Dodo IS":"Rappi",actual:resumen(actual[clave]),anterior:anterior[clave].dias.length?resumen(anterior[clave]):null,dias:filasPorDia(actual[clave].dias)}));
}

/**
 * Lo que llevan el PDF y el Excel de ventas, con el mismo periodo y la misma sucursal que el tablero.
 * null si no hay ventas importadas.
 */
export async function datosReporteVentas(q: { desde?: string; hasta?: string; sucursal?: string }): Promise<ReporteVentas | null> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerVentas(perfil.rol)) redirect("/");
  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const nombreDe = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const sucursal = sucursalElegida(veVentasDeTodas(perfil.rol), q.sucursal, perfil.sucursal_id, (id) => nombreDe.has(id));

  const ultimo = await ultimoDiaConDatos(supabase, sucursal);
  if (!ultimo) return null;
  const periodo = periodoElegido(q.desde, q.hasta, periodosRapidos(hoyMX())[0].rango);
  const [d,graficas] = await Promise.all([datosVentas(supabase, sucursal, periodo, periodoAnterior(periodo)),datosGraficasReporte(supabase,sucursal,periodo)]);

  const resumen = resumenVentas(d.dias);
  const previo = resumenVentas(d.anterior.dias);
  return {
    graficas,
    canales:reporteCanales(d.canales,d.anterior.canales),
    titulo: sucursal ? nombreDe.get(sucursal) ?? "Sucursal" : "Todas las sucursales",
    periodo,
    generadoPor: perfil.nombre,
    resumen: renglonesResumen(
      { total: resumen.total, neta: resumen.neta, iva: resumen.iva, pedidos: resumen.pedidos, ticket: resumen.ticket, costoPct: costeo(d.renglones).total.costoPct },
      previo.dias
        ? { total: previo.total, neta: previo.neta, iva: previo.iva, pedidos: previo.pedidos, ticket: previo.ticket, costoPct: costeo(d.anterior.renglones).total.costoPct }
        : null,
    ),
    dias: filasPorDia(d.dias),
  };
}
