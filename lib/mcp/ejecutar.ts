import type {SupabaseClient} from '@supabase/supabase-js';
import {consultasIA} from '@/lib/ia/consultas';
import type {FuenteIA} from '@/lib/ia/validacion';
import {absolutizar,type Argumentos} from './herramientas';

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
  case 'cortes':return conFuentes(await c.cortes(a.desde,a.hasta));
  case 'costos':return conFuentes(await c.costos(a.busqueda,a.fecha));
  case 'manuales':return conFuentes(await c.manuales(a.busqueda));
  case 'pl':return conFuentes(await c.pl(a.tipo,a.clave));
 }
}
