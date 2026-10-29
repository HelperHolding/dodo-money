import {DashboardVentasInicio} from "@/components/DashboardVentasInicio";
import { resumenPagos, type PorPagar } from "@/lib/compras/pagos";
import { diaDePagoSugerido } from "@/lib/compras/diasPago";
import { diasDePago } from "@/app/compras/servidor";
import { obtenerPerfil } from "@/lib/contexto";
import { alertasDeSucursal, fechaElegida, ordenarSucursales } from "@/lib/corporativo";
import { diaOperativoMX } from "@/lib/franjas";
import { hoyCalendarioMX } from "@/lib/formato";
import { resumenEnCamino, type Recepcion } from "@/lib/salidas";
import type { EstadoMovimiento } from "@/lib/tipos";
import { FranjaAlertas } from "@/app/cumplimiento/FranjaAlertas";
import { leerAlertas } from "@/app/cumplimiento/datos";
import { datosCorporativo } from "./datos";
import { PanelVistaGeneral } from "./PanelVistaGeneral";
export default async function Corporativo({ searchParams }: { searchParams: Promise<{ fecha?: string;ventas_mes?:string;ventas_sucursal?:string }> }) {
  const { fecha: pedida,ventas_mes,ventas_sucursal } = await searchParams;
  const ahora = new Date();
  const hoy = diaOperativoMX(ahora);
  const fecha = fechaElegida(pedida, hoy);
  const { supabase,perfil } = await obtenerPerfil();

  const datos = await datosCorporativo(supabase, fecha, ahora);
  const hoyCalendario = hoyCalendarioMX();
  const alertasCumplimiento = await leerAlertas(supabase, hoyCalendario).catch(() => null);
  const [{ data: porPagar }, { data: pagosMes }, { data: salidas }] = await Promise.all([
    supabase.from("facturas_saldo").select("id, saldo, vence_el, pago_programado_el, estado").eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).returns<PorPagar[]>(),
    supabase.from("pagos").select("fecha, monto, anulado_en").gte("fecha", `${hoyCalendario.slice(0, 7)}-01`).returns<{ fecha: string; monto: number; anulado_en: string | null }[]>(),
    supabase.from("movimientos").select("estado, recepcion, monto").eq("tipo", "salida_corporativo")
      .or("estado.eq.pendiente,and(estado.eq.confirmado,recepcion.is.null)")
      .returns<{ estado: EstadoMovimiento; recepcion: Recepcion | null; monto: number }[]>(),
  ]);
  const efectivo = resumenEnCamino(salidas ?? []);
  const dias = await diasDePago(supabase);
  const conSugerido = (porPagar ?? []).map((f) => ({ ...f, pago_sugerido_el: diaDePagoSugerido(f.vence_el, hoyCalendario, dias) }));
  const proveedoresResumen = resumenPagos(conSugerido, (pagosMes ?? []).map((p) => ({ fecha: p.fecha, monto: Number(p.monto), anulado: !!p.anulado_en })), hoyCalendario);
  const filas = ordenarSucursales(datos.map((d) => ({ ...d, alertas: alertasDeSucursal(d, fecha < hoy) })));

  return <>{alertasCumplimiento && <FranjaAlertas alertas={alertasCumplimiento} />}<PanelVistaGeneral fecha={fecha} hoy={hoy} filas={filas} efectivo={efectivo} proveedoresResumen={proveedoresResumen}
    ventas={<DashboardVentasInicio supabase={supabase} rol={perfil.rol} mes={ventas_mes} sucursal={ventas_sucursal} porDefecto={null} ruta="/corporativo" fecha={fecha}/>} /></>;
}
