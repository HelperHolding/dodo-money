import Link from "next/link";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Dona} from "@/components/Dona";
import {BarrasVerticales} from "@/components/BarrasVerticales";
import {FiltrosDashboard} from "@/components/FiltrosDashboard";
import {HistorialVentas} from "@/components/HistorialVentas";
import {datosVentas,ventaDiariaDesde,type FilaDesglose} from "@/app/ventas/datos";
import {periodoAnterior,resumenVentas,ventaPorDia} from "@/lib/ventas/calculos";
import {DESDE_HISTORIAL,origenesPedidos,periodoInicioVentas,type ParametrosDashboard} from "@/lib/ventas/inicio";
import {cambioRelativo} from "@/lib/ventas/tablero";
import {hoyCalendarioMX,fechaTexto,diaYNumero,pesos,porcentaje} from "@/lib/formato";

/** Desglose por tipo de los días de POS (aplicarConciliaciones lo conserva aunque el tipo diga VentaDia). */
const desgloseDe=(dias:readonly object[])=>dias.flatMap(x=>(x as {ventas_dia_desglose?:FilaDesglose[]}).ventas_dia_desglose??[]);

/**
 * Dashboard de inicio de admin y corporativo: KPIs del periodo, orígenes de pedidos, venta diaria e historial de ventas.
 * Los filtros de mes y sucursal navegan sin recargar la página (FiltrosDashboard); el historial cambia de periodo al instante
 * y de alcance con una acción del servidor (HistorialVentas). Sin JavaScript, el formulario sigue funcionando.
 */
export async function DashboardVentasInicio({supabase,rol,mes,sucursal,porDefecto,ruta,fecha,hist,alcance}:{supabase:SupabaseClient;rol:string;mes?:string;sucursal?:string;porDefecto:string|null;ruta:string;fecha?:string;hist?:string;alcance?:string}){
 if(!["admin","corporativo"].includes(rol))return null;
 const hoy=hoyCalendarioMX(),p=periodoInicioVentas(mes,hoy),anterior=periodoAnterior(p);
 try {
 const {data:sucursales,error}=await supabase.from("sucursales").select("id,nombre").order("nombre").returns<{id:string;nombre:string}[]>();
 if(error)throw error;
 const opciones=sucursales??[],seleccion=sucursal==="todas"?null:opciones.find(s=>s.id===(sucursal??porDefecto))?.id??null;
 // Historial: venta diaria de Dodo IS más el subtotal de Rappi desde el principio (los periodos se arman en el navegador),
 // de la sucursal elegida o de toda la red. Se pide junto con el periodo.
 const modo=hist==="semanal"||hist==="anual"?hist:"mensual",red=!seleccion||alcance==="red";
 const [d,ventaHist]=await Promise.all([datosVentas(supabase,seleccion,p,anterior),ventaDiariaDesde(supabase,red?null:seleccion,DESDE_HISTORIAL)]);
 const parametros:ParametrosDashboard={...(fecha?{fecha}:{}),ventas_mes:p.desde.slice(0,7),ventas_sucursal:seleccion??"todas",hist:modo,alcance:red?"red":"sucursal"};
 const actual=resumenVentas(d.dias),previo=resumenVentas(d.anterior.dias);
 const titulo=seleccion?opciones.find(s=>s.id===seleccion)?.nombre:"Todas las sucursales";
 const enlace=new URLSearchParams({desde:p.desde,hasta:p.hasta,...(seleccion?{sucursal:seleccion}:{})}).toString();
 const kpis=[{nombre:"Venta total con IVA",actual:actual.total,previo:previo.total,moneda:true},{nombre:"Venta neta sin IVA",actual:actual.neta,previo:previo.neta,moneda:true},{nombre:"Pedidos registrados",actual:actual.pedidos,previo:previo.pedidos,moneda:false},{nombre:"Ticket promedio con IVA",actual:actual.ticket,previo:previo.ticket,moneda:true}];
 // Orígenes: desglose solo de POS (los días combinados ya traen Rappi como agregador); Rappi (portal) es su propio origen.
 const origenes=origenesPedidos(desgloseDe(d.canales.pos.dias),resumenVentas(d.canales.pos.dias).pedidos??0,resumenVentas(d.canales.rappi.dias).pedidos??0);
 return <section className="seccion inicio-ventas" aria-labelledby="inicio-ventas-titulo"><div className="inicio-ventas-titulo"><div><h2 id="inicio-ventas-titulo">Dashboard de ventas</h2><p className="saldo-nota">{titulo} · {fechaTexto(p.desde)} a {fechaTexto(p.hasta)}</p></div><Link className="boton boton-secundario" href={`/ventas?${enlace}`}>Abrir reporte de ventas</Link></div>
 <FiltrosDashboard ruta={ruta} parametros={parametros} mesMaximo={hoy.slice(0,7)} sucursales={opciones}>
 {!actual.dias?<p className="vacio">Sin ventas importadas para este periodo y selección.</p>:<><div className="ficha-indicadores inicio-ventas-kpis">{kpis.map(k=>{const cambio=k.actual===null||!previo.dias?null:cambioRelativo(k.actual,k.previo);return <div key={k.nombre}><small>{k.nombre}</small><strong>{k.actual===null?"—":k.moneda?pesos(k.actual):k.actual.toLocaleString("es-MX")}</strong><span className="inicio-ventas-cambio" data-direccion={cambio===null?"sin":cambio>0?"sube":cambio<0?"baja":"igual"}>{cambio===null?"Sin comparación disponible":<><span className="inicio-ventas-chip">{`${cambio>0?"▲":cambio<0?"▼":"="} ${porcentaje(Math.abs(cambio))}`}</span> vs periodo anterior</>}</span></div>;})}</div>
 <div className="inicio-fila">
  <section className="inicio-tarjeta" aria-labelledby="inicio-origenes"><h3 id="inicio-origenes">Orígenes de pedidos</h3>
   <div className="inicio-origenes">
    <ul className="inicio-origenes-lista">{origenes.map(o=><li key={o.clave}><span className="inicio-origen-nombre"><span className={`dona-punto cat-${o.clave}`} aria-hidden="true"/>{o.etiqueta}</span><strong>{o.pedidos.toLocaleString("es-MX")}</strong><small>{porcentaje(o.porcentaje)}</small></li>)}</ul>
    <Dona titulo="Pedidos por origen" partes={origenes.filter(o=>o.pedidos>0).map(o=>({clave:o.clave,etiqueta:o.etiqueta,valor:o.pedidos,detalle:`${o.pedidos.toLocaleString("es-MX")} pedidos`}))}/>
   </div>
  </section>
  <section className="inicio-tarjeta" aria-labelledby="inicio-venta-diaria"><h3 id="inicio-venta-diaria">Venta diaria con IVA</h3><BarrasVerticales key={`${p.desde}|${p.hasta}|${seleccion}`} titulo="Venta diaria" dias={ventaPorDia(d.dias).map(x=>({clave:x.fecha,rotulo:diaYNumero(x.fecha),valor:x.total,detalle:`${fechaTexto(x.fecha)} · ${pesos(x.total)} · ${x.pedidos} pedidos`}))}/><p className="saldo-nota">{actual.dias} fechas con datos. Las fechas sin importación no se muestran como venta cero.</p></section>
 </div></>}
 <HistorialVentas key={`${seleccion}|${p.hasta}`} ruta={ruta} parametros={parametros} hasta={p.hasta} sucursal={seleccion} nombreSucursal={titulo??"esta sucursal"} ventaInicial={ventaHist}/>
 </FiltrosDashboard>
 <p className="saldo-nota">Comparación: {fechaTexto(anterior.desde)} a {fechaTexto(anterior.hasta)}, mismo número de días. Las importaciones pueden estar incompletas. Rappi suma solo órdenes finalizadas marcadas para sumar; usa el subtotal del restaurante, antes de comisiones, y no el depósito recibido. Mostrador son los pedidos de Dodo IS sin otro origen. El historial suma Dodo IS y el subtotal de Rappi (antes de comisiones), como el reporte de ventas.</p></section>;
 }catch{return <section className="seccion"><h2>Dashboard de ventas</h2><p className="aviso aviso-error">No se pudieron consultar las ventas. Intenta de nuevo o abre el reporte.</p><Link href="/ventas">Ir a Ventas</Link></section>;}
}
