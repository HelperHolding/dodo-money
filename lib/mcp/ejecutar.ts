import type {SupabaseClient} from '@supabase/supabase-js';
import {consultasIA} from '@/lib/ia/consultas';
import type {FuenteIA} from '@/lib/ia/validacion';
import {datosVentas} from '@/app/ventas/datos';
import {periodoAnterior} from '@/lib/ventas/calculos';
import {absolutizar,type Argumentos} from './herramientas';
import {resumenProductos} from './productos';

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
 const fuentes:FuenteIA[]=[],c=consultasIA(supabase,sucursal,rol,fuentes);
 const conFuentes=(r:object)=>absolutizar({...r,fuentes},origen);
 switch(a.herramienta){
  case 'ventas':return conFuentes(await c.ventas(a.desde,a.hasta));
  case 'productos':{
   const p={desde:a.desde,hasta:a.hasta},datos=await datosVentas(supabase,sucursal,p,periodoAnterior(p));
   return absolutizar({periodo:p,sucursal:sucursal??'Consolidado',filtro:{busqueda:a.busqueda,categoria:a.categoria},...resumenProductos(datos.renglones,a),
    diasConDatos:[...new Set(datos.dias.map(d=>d.fecha))],
    nota:'importe es venta cobrada (con IVA y descuentos); ventaNeta resta IVA. Cada tamaño es un producto distinto. Dodo IS y Rappi combinados como en el tablero. Un día sin datos no es venta cero. totales suma todos los productos que coinciden aunque la lista venga recortada.',
    fuente:`/ventas?${new URLSearchParams({...p,...(sucursal?{sucursal}:{})})}`},origen);
  }
  case 'cortes':return conFuentes(await c.cortes(a.desde,a.hasta));
  case 'costos':return conFuentes(await c.costos(a.busqueda,a.fecha));
  case 'manuales':return conFuentes(await c.manuales(a.busqueda));
  case 'pl':return conFuentes(await c.pl(a.tipo,a.clave));
 }
}
