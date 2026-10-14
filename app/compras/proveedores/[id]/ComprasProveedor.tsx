import {crearClienteServidor} from '@/lib/supabase/server';
import {leerTodo} from '@/lib/ventas/paginar';
import {fechaMX} from '@/lib/formato';
import {nombreFactura,nombreEstadoFactura,type EstadoFactura} from '@/lib/compras/facturas';
import type {EstadoOrden} from '@/lib/compras/ordenes';
import {ListaComprasProveedor,type DocumentoProveedor} from './ListaComprasProveedor';
type Orden={id:string;folio:string;estado:EstadoOrden;creado_en:string;sucursales:{nombre:string}|null};
type Factura={id:string;serie:string|null;folio:string|null;uuid:string|null;estado:EstadoFactura;tipo:'ingreso'|'egreso';origen:'manual'|'cfdi';sustituido_por:string|null;fecha_emision:string;total:number;saldo:number;sucursales:{nombre:string}|null};
const estados:Record<EstadoOrden,string>={borrador:'Borrador',enviada:'Enviada',confirmada:'Confirmada',cerrada:'Cerrada',cancelada:'Cancelada'};
export async function ComprasProveedor({id}:{id:string}) {
 const supabase=await crearClienteServidor();
 let ordenes:Orden[],facturas:Factura[];
 try {
  [ordenes,facturas]=await Promise.all([
   leerTodo<Orden>((d,h)=>supabase.from('ordenes_compra').select('id,folio,estado,creado_en,sucursales(nombre)').eq('proveedor_id',id).order('creado_en',{ascending:false}).order('id').range(d,h).returns<Orden[]>()),
   leerTodo<Factura>((d,h)=>supabase.from('facturas_saldo').select('id,serie,folio,uuid,estado,tipo,origen,sustituido_por,fecha_emision,total,saldo,sucursales(nombre)').eq('proveedor_id',id).order('fecha_emision',{ascending:false}).order('id').range(d,h).returns<Factura[]>())
  ]);
 }catch {return <section className="seccion"><h2>Compras de este proveedor</h2><p className="aviso" role="alert">No se pudieron consultar los documentos. Recarga la página para intentarlo de nuevo.</p></section>;}
 const documentos:DocumentoProveedor[]=[
  ...ordenes.map(o=>({id:o.id,grupo:o.estado==='borrador'||o.estado==='enviada'?'cotizaciones' as const:'ordenes' as const,nombre:o.folio,fecha:fechaMX(o.creado_en),estado:estados[o.estado],cancelado:o.estado==='cancelada',destino:o.sucursales?.nombre??'Oficina central',href:`/compras/ordenes/${o.id}`,total:null,saldo:null})),
  ...facturas.map(f=>({id:f.id,grupo:'facturas' as const,nombre:nombreFactura(f),fecha:f.fecha_emision,estado:f.sustituido_por?'Sustituida':nombreEstadoFactura(f.tipo,f.estado),cancelado:f.estado==='cancelada',destino:f.sucursales?.nombre??'Oficina central',href:`/compras/facturas/${f.id}`,total:f.total,saldo:f.tipo==='ingreso'?f.saldo:null,detalle:f.tipo==='egreso'?'Nota de crédito':f.origen==='manual'?'Prefactura · sin CFDI':'Factura CFDI'}))
 ];
 return <ListaComprasProveedor documentos={documentos}/>;
}
