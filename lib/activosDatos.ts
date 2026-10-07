import {obtenerPerfil} from './contexto';
import {leerTodo} from './ventas/paginar';
export type OpcionesActivo = {sucursales:{id:string;nombre:string}[];facturas:{id:string;folio:string|null;sucursal_id:string|null}[];proveedores:{id:string;razon_social:string}[]};
export async function opcionesActivo(supabase:Awaited<ReturnType<typeof obtenerPerfil>>['supabase']):Promise<OpcionesActivo> {
 const [sucursales,facturas,proveedores]=await Promise.all([
 leerTodo((d,h)=>supabase.from('sucursales').select('id,nombre').order('nombre').range(d,h).returns<OpcionesActivo['sucursales']>()),
 leerTodo((d,h)=>supabase.from('facturas').select('id,folio,sucursal_id').order('creado_en',{ascending:false}).order('id').range(d,h).returns<OpcionesActivo['facturas']>()),
 leerTodo((d,h)=>supabase.from('proveedores').select('id,razon_social').order('razon_social').order('id').range(d,h).returns<OpcionesActivo['proveedores']>())]);
 return {sucursales,facturas,proveedores};
}
