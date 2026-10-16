import type {SupabaseClient} from '@supabase/supabase-js';
import {leerTodo} from '@/lib/ventas/paginar';
import {leerRazonesSociales} from '@/lib/compras/razonesSociales';
import {diaDePagoSugerido} from '@/lib/compras/diasPago';
import {fechaDePago} from '@/lib/compras/pagos';
import {nombreFactura,type EstadoFactura} from '@/lib/compras/facturas';
import {NOMBRE_FORMA_PAGO,type FormaPago} from '@/lib/compras/proveedores';
import {seleccionarCorrida,type FacturaCorrida,type LigaCorrida,type FiltroCorrida} from '@/lib/compras/corridaPagos';
import {diasDePago} from '../servidor';
type Factura={id:string;uuid:string|null;uuid_manual:string|null;serie:string|null;folio:string|null;origen:string;tipo:string;fecha_emision:string;total:number;saldo:number;estado:EstadoFactura;vence_el:string;pago_programado_el:string|null;pago_programado_forma:FormaPago|null;proveedor_id:string;sucursal_id:string|null;rfc_receptor:string;falta_complemento:boolean;proveedores:{razon_social:string;nombre_comercial:string|null}|null};
export async function cargarCorrida(db:SupabaseClient,filtro:FiltroCorrida,hoy:string){
 const [facturas,dias,razones,{data:sucursales,error:errorSucursales}]=await Promise.all([
  leerTodo<Factura>((d,h)=>{let q=db.from('facturas_saldo').select('id,uuid,uuid_manual,serie,folio,origen,tipo,fecha_emision,total,saldo,estado,vence_el,pago_programado_el,pago_programado_forma,proveedor_id,sucursal_id,rfc_receptor,falta_complemento,proveedores(razon_social,nombre_comercial)').eq('tipo','ingreso').in('estado',['por_pagar','parcial']).gt('saldo',0);if(filtro.proveedor)q=q.eq('proveedor_id',filtro.proveedor);if(filtro.complemento==='si')q=q.eq('falta_complemento',true);return q.order('id').range(d,h).returns<Factura[]>();}),
  diasDePago(db),leerRazonesSociales(db),db.from('sucursales').select('id,nombre').order('id').returns<{id:string;nombre:string}[]>()
 ]);
 if(errorSucursales)throw Error('No se pudieron consultar las sucursales.');
 const preparadas=facturas.map(f=>({...f,pago_sugerido_el:diaDePagoSugerido(f.vence_el,hoy,dias)})).filter(f=>fechaDePago(f)>=filtro.desde&&fechaDePago(f)<=filtro.hasta);
 if(preparadas.length>10000)throw Error('Hay más de 10,000 documentos. Reduce el rango de la corrida.');
 const ligas:LigaCorrida[]=[],conceptos=new Map<string,string[]>();
 for(let i=0;i<preparadas.length;i+=200){const ids=preparadas.slice(i,i+200).map(f=>f.id);
  const [ls,cs]=await Promise.all([
   leerTodo<{factura_id:string;ordenes_compra:{sucursal_id:string|null}|null}>((d,h)=>db.from('factura_ordenes').select('factura_id,orden_id,ordenes_compra(sucursal_id)').in('factura_id',ids).order('factura_id').order('orden_id').range(d,h).returns<{factura_id:string;ordenes_compra:{sucursal_id:string|null}|null}[]>()),
   leerTodo<{factura_id:string;descripcion:string}>((d,h)=>db.from('factura_conceptos').select('factura_id,descripcion').in('factura_id',ids).order('id').range(d,h))
  ]);
  ligas.push(...ls.map(l=>({factura_id:l.factura_id,sucursal_id:l.ordenes_compra?.sucursal_id??null})));
  for(const c of cs)conceptos.set(c.factura_id,[...(conceptos.get(c.factura_id)??[]),c.descripcion]);
 }
 const empresas=new Map(razones.map(e=>[e.rfc,e]));
 const datos:FacturaCorrida[]=preparadas.map(f=>({...f,uuid:f.uuid??f.uuid_manual,fechaPago:fechaDePago(f),empresa:empresas.get(f.rfc_receptor)?.razon_social??f.rfc_receptor,empresaActiva:empresas.get(f.rfc_receptor)?.activa??false,proveedor:f.proveedores?.nombre_comercial??f.proveedores?.razon_social??'Sin proveedor',nombre:nombreFactura(f),formaPrevista:f.pago_programado_forma?NOMBRE_FORMA_PAGO[f.pago_programado_forma]:null,conceptos:conceptos.get(f.id)??[]}));
 return seleccionarCorrida(datos,ligas,new Map((sucursales??[]).map(s=>[s.id,s.nombre])),filtro);
}
