import type {SupabaseClient} from '@supabase/supabase-js';
import {datosVentas} from '@/app/ventas/datos';
import {resumenVentas,costeo,periodoAnterior} from '@/lib/ventas/calculos';
import {datosPL,vistaPL} from '@/app/finanzas/datos';
import {leerTodo} from '@/lib/ventas/paginar';
import {elegirPeriodo,paramsPeriodo} from '@/lib/finanzas/periodo';
import {INICIO_FECHA} from '@/lib/finanzas/pl';
import {hoyMX} from '@/lib/formato';
import {rangoIA,fechaIA,type FuenteIA} from './validacion';
type TurnoConsulta={id:string;sucursal_id:string;sucursales:{nombre:string}|null;fecha:string;tipo:string;cerrado_en:string|null;arqueos:{momento:string;esperado:number;total_contado:number;diferencia:number;anulado_en:string|null}[]};
export function consultasIA(supabase:SupabaseClient,sucursal:string|null,rol:string,fuentes:FuenteIA[]) {
 const fuente=(titulo:string,href:string)=>{if(fuentes.length<30&&!fuentes.some(f=>f.href===href))fuentes.push({titulo:titulo.slice(0,160),href});};
 return {
 async ventas(desde:string,hasta:string){
 const p=rangoIA(desde,hasta),datos=await datosVentas(supabase,sucursal,p,periodoAnterior(p)),resumen=resumenVentas(datos.dias),costos=costeo(datos.renglones);
 const href=`/ventas?${new URLSearchParams({...p,...(sucursal?{sucursal}:{})})}`;fuente('Ventas y costo teórico del periodo',href);
 return {periodo:p,sucursal:sucursal??'Consolidado',resumen,costoTeorico:costos.total,productosSinCosto:costos.sinCosto.slice(0,20),cantidadProductosSinCosto:costos.sinCosto.length,diasConDatos:datos.dias.map(d=>d.fecha).filter((d,i,a)=>a.indexOf(d)===i),nota:'Venta cobrada incluye IVA y descuentos; neta resta IVA. Dodo IS y Rappi se combinan con las mismas reglas que el tablero. Un día sin datos no equivale a venta cero. Costo parcial si faltan productos por costear.',fuente:href};
 },
 async cortes(desde:string,hasta:string){
 const p=rangoIA(desde,hasta),turnos=await leerTodo<TurnoConsulta>((d,h)=>{let q=supabase.from('turnos').select('id,sucursal_id,sucursales(nombre),fecha,tipo,cerrado_en,arqueos(momento,esperado,total_contado,diferencia,anulado_en)').gte('fecha',p.desde).lte('fecha',p.hasta);if(sucursal)q=q.eq('sucursal_id',sucursal);return q.order('fecha').order('id').range(d,h).returns<TurnoConsulta[]>();});
 for(const t of turnos.slice(0,20))fuente(`${t.sucursales?.nombre??'Sucursal'} · ${t.tipo} · ${t.fecha}`,`/reporte/turno/${t.id}`);
 const resumen=turnos.map(t=>({sucursal:t.sucursales?.nombre??t.sucursal_id,fecha:t.fecha,tipo:t.tipo,cerrado:!!t.cerrado_en,arqueos:t.arqueos.filter(a=>!a.anulado_en).map(a=>({momento:a.momento,esperado:Number(a.esperado),contado:Number(a.total_contado),diferencia:Number(a.diferencia)})),fuente:`/reporte/turno/${t.id}`}));
 return {periodo:p,turnos:resumen.slice(0,100),totalTurnos:turnos.length,truncado:turnos.length>100,nota:'Solo arqueos vigentes; los anulados se excluyen. Diferencia es contado menos esperado; un turno sin cierre no tiene corte final.'};
 },
 async costos(busqueda:string,fecha:string){
 fechaIA(fecha);if(typeof busqueda!=='string'||busqueda.trim().length<2||busqueda.length>100)throw Error('Escribe al menos dos caracteres del producto.');
 const patron=busqueda.replace(/[\\%_]/g,'').trim();if(patron.length<2)throw Error('Búsqueda inválida.');
 const {data,error}=await supabase.from('productos_venta').select('dodo_id,nombre').ilike('nombre',`%${patron}%`).order('dodo_id').limit(11).returns<{dodo_id:number;nombre:string}[]>();if(error)throw Error('No se pudieron consultar productos.');
 const resultados=await Promise.all((data??[]).slice(0,10).map(async p=>{
 if(rol==='gerente'){const comprobacion=await supabase.from('ventas_producto').select('dodo_id').eq('dodo_id',p.dodo_id).eq('sucursal_id',sucursal!).limit(1);if(comprobacion.error)throw Error('No se pudieron validar los productos de tu sucursal.');if(!comprobacion.data?.length)return null;}
 const {data:c,error:ec}=await supabase.from('costos_producto').select('costo,vigente_desde,fuente,nota').eq('dodo_id',p.dodo_id).lte('vigente_desde',fecha).order('vigente_desde',{ascending:false}).limit(1).maybeSingle<{costo:number;vigente_desde:string;fuente:string|null;nota:string|null}>();if(ec)throw Error('No se pudieron consultar costos.');
 const href=rol==='gerente'?`/ventas?sucursal=${sucursal}&desde=${fecha}&hasta=${fecha}`:`/ventas/costos/productos/${p.dodo_id}`;fuente(p.nombre,href);return {...p,costo:c?Number(c.costo):null,vigenteDesde:c?.vigente_desde??null,fuenteCosto:c?.fuente??null,nota:c?.nota??null,href};
 }));return {fecha,productos:resultados.filter(p=>p!==null),busquedaTruncada:(data??[]).length>10,nota:'Costo unitario vigente para la fecha, no precio de venta. Sin costo es desconocido, no cero. Gerentes solo consultan productos registrados en ventas de su sucursal.'};
 },
 async manuales(busqueda:string){
 if(typeof busqueda!=='string'||busqueda.length<2||busqueda.length>100)throw Error('Búsqueda inválida.');
 const {data,error}=await supabase.from('kb_articulos').select('id,titulo,contenido,revision').eq('publicado',true).textSearch('contenido',busqueda,{config:'spanish',type:'websearch'}).order('id').limit(3);if(error)throw Error('No se pudieron consultar manuales.');
 return {manuales:(data??[]).map(a=>{const href=`/conocimiento/manuales/${a.id}`;fuente(a.titulo,href);return {...a,contenido:a.contenido.slice(0,5000),truncado:a.contenido.length>5000,href};})};
 },
 async pl(tipo:'mes'|'semana',clave:string){
 if(!['admin','corporativo'].includes(rol))throw Error('El P&L está reservado a administración y corporativo.');
 if(!['mes','semana'].includes(tipo)||typeof clave!=='string'||clave.length>10)throw Error('Periodo inválido.');
 const p=elegirPeriodo({periodo:tipo,...(tipo==='mes'?{mes:clave}:{semana:clave})},hoyMX(),INICIO_FECHA);if(p.clave!==clave||p.tipo!==tipo)throw Error('Periodo fuera del historial disponible.');
 const href=`/finanzas?${new URLSearchParams({...paramsPeriodo(p),...(sucursal?{sucursal}:{})})}`;fuente(`P&L · ${p.titulo}`,href);
 if(p.vacio)return {periodo:p,nota:'Todavía no hay días cerrados en el periodo.',fuente:href};
 const d=await datosPL(supabase,p),v=vistaPL(d,sucursal??undefined);
 return {periodo:p,titulo:v.titulo,filas:v.filas.map(f=>({nombre:f.nombre,monto:f.monto,porcentaje:f.pct,sinCapturar:f.sinCapturar})),avisos:v.avisos,nota:'Mismo periodo de semana o mes y cálculo que la pantalla; un periodo en curso se recorta a ayer del día de operación.',fuente:href};
 }
 };
}
