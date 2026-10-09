import Link from "next/link";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Dona} from "@/components/Dona";
import {BarrasVerticales} from "@/components/BarrasVerticales";
import {datosVentas} from "@/app/ventas/datos";
import {periodoAnterior,resumenVentas,ventaPorDia} from "@/lib/ventas/calculos";
import {periodoInicioVentas} from "@/lib/ventas/inicio";
import {cambioRelativo} from "@/lib/ventas/tablero";
import {hoyCalendarioMX,fechaTexto,diaYNumero,pesos,porcentaje} from "@/lib/formato";
export async function DashboardVentasInicio({supabase,rol,mes,sucursal,porDefecto,ruta,fecha}:{supabase:SupabaseClient;rol:string;mes?:string;sucursal?:string;porDefecto:string|null;ruta:string;fecha?:string}){
 if(!["admin","corporativo"].includes(rol))return null;
 const hoy=hoyCalendarioMX(),p=periodoInicioVentas(mes,hoy),anterior=periodoAnterior(p);
 try {
 const {data:sucursales,error}=await supabase.from("sucursales").select("id,nombre").order("nombre").returns<{id:string;nombre:string}[]>();
 if(error)throw error;
 const opciones=sucursales??[],seleccion=sucursal==="todas"?null:opciones.find(s=>s.id===(sucursal??porDefecto))?.id??null;
 const d=await datosVentas(supabase,seleccion,p,anterior),actual=resumenVentas(d.dias),previo=resumenVentas(d.anterior.dias);
 const titulo=seleccion?opciones.find(s=>s.id===seleccion)?.nombre:"Todas las sucursales";
 const enlace=new URLSearchParams({desde:p.desde,hasta:p.hasta,...(seleccion?{sucursal:seleccion}:{})}).toString();
 const canales=(["pos","rappi"] as const).map(clave=>({clave,nombre:clave==="pos"?"POS / Dodo IS":"Rappi",...resumenVentas(d.canales[clave].dias)}));
 const kpis=[{nombre:"Venta total con IVA",actual:actual.total,previo:previo.total,moneda:true},{nombre:"Venta neta sin IVA",actual:actual.neta,previo:previo.neta,moneda:true},{nombre:"Pedidos registrados",actual:actual.pedidos,previo:previo.pedidos,moneda:false},{nombre:"Ticket promedio con IVA",actual:actual.ticket,previo:previo.ticket,moneda:true}];
 return <section className="seccion inicio-ventas" aria-labelledby="inicio-ventas-titulo"><div className="inicio-ventas-titulo"><div><h2 id="inicio-ventas-titulo">Dashboard de ventas</h2><p className="saldo-nota">{titulo} · {fechaTexto(p.desde)} a {fechaTexto(p.hasta)}</p></div><Link className="boton boton-secundario" href={`/ventas?${enlace}`}>Abrir reporte de ventas</Link></div>
 <form action={ruta} method="get" className="acciones inicio-ventas-filtros">{fecha&&<input type="hidden" name="fecha" value={fecha}/>}<label className="campo">Mes<input type="month" name="ventas_mes" max={hoy.slice(0,7)} defaultValue={p.desde.slice(0,7)}/></label><label className="campo">Sucursal<select name="ventas_sucursal" defaultValue={seleccion??"todas"}><option value="todas">Todas las sucursales</option>{opciones.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><button className="boton" type="submit">Consultar</button></form>
 {!actual.dias?<p className="vacio">Sin ventas importadas para este periodo y selección.</p>:<><div className="ficha-indicadores inicio-ventas-kpis">{kpis.map(k=>{const cambio=k.actual===null||!previo.dias?null:cambioRelativo(k.actual,k.previo);return <div key={k.nombre}><small>{k.nombre}</small><strong>{k.actual===null?"—":k.moneda?pesos(k.actual):k.actual.toLocaleString("es-MX")}</strong><span className="inicio-ventas-cambio" data-direccion={cambio===null?"sin":cambio>0?"sube":cambio<0?"baja":"igual"}>{cambio===null?"Sin comparación disponible":`${cambio>0?"▲":cambio<0?"▼":"="} ${porcentaje(Math.abs(cambio))} vs periodo anterior`}</span></div>;})}</div>
 <div className="tablero-fila tablero-fila-ancha"><section aria-labelledby="inicio-venta-diaria"><h3 id="inicio-venta-diaria">Venta diaria con IVA</h3><BarrasVerticales key={`${p.desde}|${p.hasta}|${seleccion}`} titulo="Venta diaria" dias={ventaPorDia(d.dias).map(x=>({clave:x.fecha,rotulo:diaYNumero(x.fecha),valor:x.total,detalle:`${fechaTexto(x.fecha)} · ${pesos(x.total)} · ${x.pedidos} pedidos`}))}/><p className="saldo-nota">{actual.dias} fechas con datos. Las fechas sin importación no se muestran como venta cero.</p></section><section className="inicio-dona-canales" aria-labelledby="inicio-canales"><h3 id="inicio-canales">Participación por canal</h3><Dona titulo="Venta por canal" partes={canales.map(c=>({clave:c.clave,etiqueta:c.clave==="pos"?"POS":"Rappi",valor:c.total,detalle:pesos(c.total)}))}/></section></div>
 <div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><thead><tr><th>Canal</th><th className="monto">Venta con IVA</th><th className="monto">Venta neta</th><th className="monto">Pedidos</th><th>Última fecha con datos</th></tr></thead><tbody>{canales.map(c=><tr key={c.clave}><td data-label="Canal">{c.nombre}</td><td data-label="Venta con IVA" className="monto">{pesos(c.total)}</td><td data-label="Venta neta" className="monto">{pesos(c.neta)}</td><td data-label="Pedidos" className="monto">{c.pedidos}</td><td data-label="Última fecha con datos">{d.canales[c.clave].dias.length?fechaTexto(d.canales[c.clave].dias.map(x=>x.fecha).sort().at(-1)!):"Sin datos en el periodo"}</td></tr>)}</tbody></table></div></>}
 <p className="saldo-nota">Comparación: {fechaTexto(anterior.desde)} a {fechaTexto(anterior.hasta)}, mismo número de días. Las importaciones pueden estar incompletas. Rappi suma solo órdenes finalizadas marcadas para sumar; usa el subtotal del restaurante, antes de comisiones, y no el depósito recibido.</p></section>;
 }catch{return <section className="seccion"><h2>Dashboard de ventas</h2><p className="aviso aviso-error">No se pudieron consultar las ventas. Intenta de nuevo o abre el reporte.</p><Link href="/ventas">Ir a Ventas</Link></section>;}
}
