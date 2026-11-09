import Link from "next/link";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Dona} from "@/components/Dona";
import {BarrasVerticales} from "@/components/BarrasVerticales";
import {LineaHistorial} from "@/components/LineaHistorial";
import {datosVentas,ventaDiariaDesde} from "@/app/ventas/datos";
import {periodoAnterior,resumenVentas,ventaPorDia} from "@/lib/ventas/calculos";
import {historialVentas,origenesPedidos,periodoInicioVentas} from "@/lib/ventas/inicio";
import {cambioRelativo} from "@/lib/ventas/tablero";
import {hoyCalendarioMX,fechaTexto,diaYNumero,pesos,porcentaje} from "@/lib/formato";

const sumarDiasISO=(f:string,n:number)=>{const x=new Date(`${f}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const MODOS=[["semanal","Semanal"],["mensual","Mensual"],["anual","Anual"]] as const;

/**
 * Dashboard de inicio de admin y corporativo: KPIs del periodo, orígenes de pedidos, venta diaria e historial de ventas.
 * Filtros por mes y sucursal; el historial cambia de periodo (hist) y de alcance (alcance) con enlaces, sin JavaScript.
 */
export async function DashboardVentasInicio({supabase,rol,mes,sucursal,porDefecto,ruta,fecha,hist,alcance}:{supabase:SupabaseClient;rol:string;mes?:string;sucursal?:string;porDefecto:string|null;ruta:string;fecha?:string;hist?:string;alcance?:string}){
 if(!["admin","corporativo"].includes(rol))return null;
 const hoy=hoyCalendarioMX(),p=periodoInicioVentas(mes,hoy),anterior=periodoAnterior(p);
 try {
 const {data:sucursales,error}=await supabase.from("sucursales").select("id,nombre").order("nombre").returns<{id:string;nombre:string}[]>();
 if(error)throw error;
 const opciones=sucursales??[],seleccion=sucursal==="todas"?null:opciones.find(s=>s.id===(sucursal??porDefecto))?.id??null;
 const d=await datosVentas(supabase,seleccion,p,anterior),actual=resumenVentas(d.dias),previo=resumenVentas(d.anterior.dias);
 const titulo=seleccion?opciones.find(s=>s.id===seleccion)?.nombre:"Todas las sucursales";
 const enlace=new URLSearchParams({desde:p.desde,hasta:p.hasta,...(seleccion?{sucursal:seleccion}:{})}).toString();
 const kpis=[{nombre:"Venta total con IVA",actual:actual.total,previo:previo.total,moneda:true},{nombre:"Venta neta sin IVA",actual:actual.neta,previo:previo.neta,moneda:true},{nombre:"Pedidos registrados",actual:actual.pedidos,previo:previo.pedidos,moneda:false},{nombre:"Ticket promedio con IVA",actual:actual.ticket,previo:previo.ticket,moneda:true}];
 // Orígenes: Dodo IS marca el origen de cada pedido; Rappi (portal) es su propio origen, igual que en los KPIs.
 const origenes=origenesPedidos(d.dias.flatMap(x=>x.ventas_dia_desglose??[]),resumenVentas(d.canales.pos.dias).pedidos??0,resumenVentas(d.canales.rappi.dias).pedidos??0);
 // Historial: venta diaria importada de Dodo IS, de la sucursal elegida o de toda la red.
 const modo=hist==="semanal"||hist==="anual"?hist:"mensual",red=!seleccion||alcance==="red";
 const desdeHist=modo==="anual"?"2000-01-01":modo==="semanal"?sumarDiasISO(p.hasta,-84):`${Number(p.hasta.slice(0,4))-1}${p.hasta.slice(4,7)}-01`;
 const puntos=historialVentas(await ventaDiariaDesde(supabase,red?null:seleccion,desdeHist),p.hasta,modo);
 const liga=(cambios:Record<string,string>)=>`${ruta}?${new URLSearchParams({...(fecha?{fecha}:{}),ventas_mes:p.desde.slice(0,7),ventas_sucursal:seleccion??"todas",hist:modo,alcance:red?"red":"sucursal",...cambios})}#inicio-historial`;
 return <section className="seccion inicio-ventas" aria-labelledby="inicio-ventas-titulo"><div className="inicio-ventas-titulo"><div><h2 id="inicio-ventas-titulo">Dashboard de ventas</h2><p className="saldo-nota">{titulo} · {fechaTexto(p.desde)} a {fechaTexto(p.hasta)}</p></div><Link className="boton boton-secundario" href={`/ventas?${enlace}`}>Abrir reporte de ventas</Link></div>
 <form action={ruta} method="get" className="acciones inicio-ventas-filtros">{fecha&&<input type="hidden" name="fecha" value={fecha}/>}<label className="campo">Mes<input type="month" name="ventas_mes" max={hoy.slice(0,7)} defaultValue={p.desde.slice(0,7)}/></label><label className="campo">Sucursal<select name="ventas_sucursal" defaultValue={seleccion??"todas"}><option value="todas">Todas las sucursales</option>{opciones.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><button className="boton" type="submit">Consultar</button></form>
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
 <section className="inicio-historial" id="inicio-historial" aria-labelledby="inicio-historial-titulo">
  <div className="inicio-historial-cabecera"><h2 id="inicio-historial-titulo">Historial de ventas</h2>
   {seleccion&&<nav className="segmentos" aria-label="Alcance del historial">{(["sucursal","red"] as const).map(a=><a key={a} href={liga({alcance:a})} aria-current={(a==="red")===red?"page":undefined}>{a==="red"?"Toda la red":"Esta sucursal"}</a>)}</nav>}
  </div>
  <LineaHistorial titulo={`Venta con IVA, ${red?"toda la red":titulo}`} puntos={puntos}/>
  <nav className="segmentos inicio-historial-modo" aria-label="Periodo del historial">{MODOS.map(([m,texto])=><a key={m} href={liga({hist:m})} aria-current={m===modo?"page":undefined}>{texto}</a>)}</nav>
 </section>
 <p className="saldo-nota">Comparación: {fechaTexto(anterior.desde)} a {fechaTexto(anterior.hasta)}, mismo número de días. Las importaciones pueden estar incompletas. Rappi suma solo órdenes finalizadas marcadas para sumar; usa el subtotal del restaurante, antes de comisiones, y no el depósito recibido. Mostrador son los pedidos de Dodo IS sin otro origen. El historial usa la venta diaria importada de Dodo IS.</p></section>;
 }catch{return <section className="seccion"><h2>Dashboard de ventas</h2><p className="aviso aviso-error">No se pudieron consultar las ventas. Intenta de nuevo o abre el reporte.</p><Link href="/ventas">Ir a Ventas</Link></section>;}
}
