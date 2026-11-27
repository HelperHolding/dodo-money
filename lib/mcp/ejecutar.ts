import type {SupabaseClient} from '@supabase/supabase-js';
import {consultasIA} from '@/lib/ia/consultas';
import type {FuenteIA} from '@/lib/ia/validacion';
import {datosVentas} from '@/app/ventas/datos';
import {periodoAnterior} from '@/lib/ventas/calculos';
import {leerTodo} from '@/lib/ventas/paginar';
import type {Pedido} from '@/lib/ventas/pedidos';
import {absolutizar,type Argumentos} from './herramientas';
import {resumenProductos} from './productos';
import {filtrosBI,parametrosBI,periodoBI,resumenBI,type SalidaBI} from './bi';
import {hoyMX} from '@/lib/formato';
import {resumenTiempos} from './tiempos';
import {ejecutarCompras} from './comprasDatos';

type PedidoTiempo=Pedido&{sucursal_id:string};

// Ejecuta una herramienta ya validada con la sesión de la cuenta de servicio; RLS sigue aplicando.
export async function ejecutarHerramienta(supabase:SupabaseClient,rol:string,a:Argumentos,origen:string):Promise<unknown> {
 if(a.herramienta==='sucursales'){
  const {data,error}=await supabase.from('sucursales').select('id,nombre').order('nombre');
  if(error)throw Error('No se pudieron consultar las sucursales.');
  return {sucursales:data??[]};
 }
 const sucursal='sucursal' in a?a.sucursal:null;
 if(sucursal){
  const {data,error}=await supabase.from('sucursales').select('id').eq('id',sucursal).maybeSingle();
  if(error||!data)throw Error('Sucursal no disponible. Usa la herramienta sucursales para ver los id válidos.');
 }
 if(a.herramienta==='por_pagar'||a.herramienta==='pagos'||a.herramienta==='compras'||a.herramienta==='ordenes')return absolutizar(await ejecutarCompras(supabase,a),origen);
 const fuentes:FuenteIA[]=[],c=consultasIA(supabase,sucursal,rol,fuentes);
 const conFuentes=(r:object)=>absolutizar({...r,fuentes},origen);
 switch(a.herramienta){
  case 'ventas':return conFuentes(await c.ventas(a.desde,a.hasta));
  case 'productos':{
   const p={desde:a.desde,hasta:a.hasta},datos=await datosVentas(supabase,sucursal,p,periodoAnterior(p));
   return absolutizar({periodo:p,sucursal:sucursal??'Consolidado',filtro:{busqueda:a.busqueda,categoria:a.categoria},...resumenProductos(datos.renglones,a),
    diasConDatos:[...new Set(datos.dias.map(d=>d.fecha))],
    nota:'importe es venta cobrada (con IVA y descuentos); ventaNeta resta IVA. Dodo IS y Rappi combinados como en el tablero. Para un sabor usa porSabor, que suma sus tamaños sin mezclar sabores parecidos; totales suma todo lo que coincide (sin rappiSinVincular) aunque la lista venga recortada. rappiSinVincular son combos o renglones de Rappi con varias piezas: no son pizzas sueltas del sabor. Las pizzas Mitad y mitad no registran sabor (mitadYMitad): dilo si preguntan por un sabor. sinCoincidencias=true significa que ningún nombre coincide, no venta cero. Un día sin datos no es venta cero.',
    fuente:`/ventas?${new URLSearchParams({...p,...(sucursal?{sucursal}:{})})}`},origen);
  }
  case 'bi':{
   const hoy=hoyMX(),periodo=periodoBI(a,hoy),f=filtrosBI(a,hoy),q=parametrosBI(f,a.comparar);
   const [x,y]=await Promise.all([supabase.rpc('ventas_bi',{p:q.actual}),supabase.rpc('ventas_bi',{p:q.anterior})]);
   if(x.error||y.error)throw Error([x.error,y.error].some(e=>e?.code==='42501')?'Ventas BI está reservado a admin y corporativo.':'No se pudo calcular Ventas BI. Intenta con un rango más corto.');
   return absolutizar({periodo,comparacion:q.comparacion,sucursal:sucursal??'Consolidado',canal:a.canal??'todos',filtroDias:a.dias??'todos',
    ...resumenBI(x.data as SalidaBI,y.data as SalidaBI,f),
    nota:'ventaNeta es sin IVA (no es la venta cobrada de la herramienta ventas). Mismo cálculo que Ventas → BI: pedidos entregados de Dodo IS y órdenes finalizadas del portal de Rappi; excluye comida del personal y cancelados. cambioPct compara contra comparacion; es null si ese periodo no tuvo venta. Horas en hora de México. categorias solo incluye renglones de Dodo IS. sinVenta=true significa que no hubo pedidos con esos filtros. Si periodo.incluyeHoy es true, hoy aún no cierra y la comparación favorece al periodo anterior: dilo. Si periodo.hastaPedido no es null, se recortó a hoy. diaPico usa ventaNetaPromedioDia (venta entre ocurrencias del día). semanas puede incluir semanas incompletas al inicio o al final.',
    fuente:q.fuente},origen);
  }
  case 'tiempos':{
   const [pedidos,suc]=await Promise.all([
    leerTodo<PedidoTiempo>((desde,hasta)=>{
     let q=supabase.from('pedidos').select('dodo_id,sucursal_id,fecha,hora,pago,tipo,origen,para_llevar,estado,total,total_sin_descuento,agregador,inicio_coccion,listo,entregado').gte('fecha',a.desde).lte('fecha',a.hasta);
     if(sucursal)q=q.eq('sucursal_id',sucursal);
     return q.order('dodo_id').range(desde,hasta).returns<PedidoTiempo[]>();
    }),
    supabase.from('sucursales').select('id,nombre'),
   ]);
   const nombres=new Map(((suc.data??[]) as {id:string;nombre:string}[]).map(x=>[x.id,x.nombre]));
   // Postgres devuelve la hora como "13:05:00" y los montos como texto (igual que en Ventas).
   const r=resumenTiempos(pedidos.map(p=>({...p,hora:p.hora.slice(0,5),total:Number(p.total),total_sin_descuento:Number(p.total_sin_descuento)})),nombres);
   return absolutizar({periodo:{desde:a.desde,hasta:a.hasta},sucursal:sucursal??'Consolidado',...r,
    nota:`Cocina: de que se empieza a que queda listo. Entrega: de que se pide a que se entrega. Lento = más de ${r.minutosLento} min en cocina. Solo cuentan pedidos de Dodo IS con hora registrada (ver cobertura): la sincronización automática de Dodo IS no guarda tiempos, solo los días importados desde Excel los tienen. sinDatos=true o poca cobertura significa que no hay tiempos suficientes, no que el servicio fuera rápido. Las medianas están en minutos. Para comparar sucursales usa solo las que tienen muestraChica=false (al menos ${r.minimoComparable} pedidos con tiempo) y menciona diasConTiempo y pctConTiempo de cada una: si cubren días distintos, la comparación es débil.`,
    fuente:`/ventas?${new URLSearchParams({desde:a.desde,hasta:a.hasta,...(sucursal?{sucursal}:{})})}`},origen);
  }
  case 'cortes':return conFuentes(await c.cortes(a.desde,a.hasta));
  case 'costos':return conFuentes(await c.costos(a.busqueda,a.fecha));
  case 'manuales':return conFuentes(await c.manuales(a.busqueda));
  case 'pl':return conFuentes(await c.pl(a.tipo,a.clave));
 }
}
