import type { EstadoOrden } from "./ordenes";
import type { EstadoFactura } from "./facturas";

export type EtapaCompra = "cotizacion" | "orden" | "factura";
export type TonoCompra = "ambar" | "azul" | "violeta" | "verde" | "gris";
export const ETAPAS_COMPRA: Record<EtapaCompra,string> = {cotizacion:"Cotización",orden:"Orden de compra",factura:"Factura"};
type Base = {id:string;nombre:string;proveedor_id:string;proveedor:string;sucursal_id:string|null;destino:string;fecha:string;importe:number};
export type OrdenCompraVista = Base & {estado:EstadoOrden};
export type FacturaCompraVista = Base & {estado:EstadoFactura;saldo:number;vence_el:string;tipo:"ingreso"|"egreso";origen:"manual"|"cfdi";sustituido_por:string|null};
export type LigaCompra = {orden_id:string;factura_id:string};
export type DocumentoCompra = Base & {clave:string;etapa:EtapaCompra;estado:string;estadoTexto:string;tono:TonoCompra;href:string;saldo:number|null;vencida:boolean;sinCfdi:boolean;notaCredito:boolean;ordenes:{id:string;nombre:string}[]};

/** Una factura vigente reemplaza la fila de su orden; conserva los enlaces de origen.
 * Varias facturas de una orden siguen siendo documentos distintos. Una cancelada no oculta la orden.
 */
export function documentosCompra(ordenes:readonly OrdenCompraVista[],facturas:readonly FacturaCompraVista[],ligas:readonly LigaCompra[],hoy:string):DocumentoCompra[]{
 const ordenPorId=new Map(ordenes.map(o=>[o.id,o]));
 const facturasVigentes=new Set(facturas.filter(f=>f.tipo==="ingreso"&&f.estado!=="cancelada").map(f=>f.id));
 const facturadas=new Set(ligas.filter(l=>facturasVigentes.has(l.factura_id)).map(l=>l.orden_id));
 const ligasPorFactura=new Map<string,Set<string>>();
 for(const l of ligas){const ids=ligasPorFactura.get(l.factura_id)??new Set<string>();ids.add(l.orden_id);ligasPorFactura.set(l.factura_id,ids);}
 const nombresOrden:Record<EstadoOrden,string>={borrador:"Borrador",enviada:"Enviada",confirmada:"Confirmada",cerrada:"Cerrada",cancelada:"Cancelada"};
 const nombresFactura:Record<EstadoFactura,string>={por_pagar:"Por pagar",parcial:"Pago parcial",pagada:"Pagada",cancelada:"Cancelada"};
 const filas:DocumentoCompra[]=ordenes.filter(o=>!facturadas.has(o.id)).map(o=>{
  const etapa:EtapaCompra=o.estado==="borrador"||o.estado==="enviada"?"cotizacion":"orden";
  return {...o,clave:`orden:${o.id}`,etapa,estadoTexto:nombresOrden[o.estado],tono:o.estado==="cancelada"?"gris":o.estado==="cerrada"?"verde":etapa==="cotizacion"?"ambar":"azul",href:`/compras/ordenes/${o.id}`,saldo:null,vencida:false,sinCfdi:false,notaCredito:false,ordenes:[]};
 });
 for(const f of facturas){
  const ids=[...(ligasPorFactura.get(f.id)??[])];
  filas.push({...f,clave:`factura:${f.id}`,etapa:"factura",estadoTexto:f.sustituido_por?"Sustituida":nombresFactura[f.estado],tono:f.estado==="cancelada"?"gris":f.estado==="pagada"?"verde":"violeta",href:`/compras/facturas/${f.id}`,vencida:f.tipo==="ingreso"&&(f.estado==="por_pagar"||f.estado==="parcial")&&f.saldo>0&&f.vence_el<hoy,sinCfdi:f.origen==="manual",notaCredito:f.tipo==="egreso",ordenes:ids.map(id=>({id,nombre:ordenPorId.get(id)?.nombre??"Ver orden"}))});
 }
 return filas.sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.clave.localeCompare(b.clave));
}
const normalizar=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function filtrarDocumentosCompra(filas:readonly DocumentoCompra[],f:{etapa?:string;estado?:string;proveedor?:string;sucursal?:string;q?:string;canceladas?:boolean}){
 const q=normalizar(f.q?.trim()??"");
 return filas.filter(d=>(f.canceladas||d.estado!=="cancelada")&&(!f.etapa||d.etapa===f.etapa)&&(!f.estado||d.estado===f.estado)&&(!f.proveedor||d.proveedor_id===f.proveedor)&&(!f.sucursal||(f.sucursal==="oficina"?d.sucursal_id===null:d.sucursal_id===f.sucursal))&&(!q||normalizar([d.nombre,d.proveedor,d.destino,...d.ordenes.map(o=>o.nombre)].join(" ")).includes(q)));
}
