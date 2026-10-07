import type {Insumo,Material} from "./bom";
import type {RappiGuardada,CatalogoRappi} from "../ventas/rappi";
const normal=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/🚨/g,"").trim().toLowerCase().replace(/\s+/g," ");
/** Un vínculo solo existe si el nombre normalizado coincide de forma única en esta versión. */
export function insumoDeMaterial(m:Material,insumos:readonly Insumo[]) {
 const encontrados=insumos.filter(i=>normal(i.nombre)===normal(m.nombre));
 return encontrados.length===1?encontrados[0]:null;
}
/** Precio bruto por pieza observado, sin confundir cobro con descuento con precio de menú. */
export function preciosRappi(id:number,ordenes:readonly RappiGuardada[],catalogo:readonly CatalogoRappi[]) {
 const ids=new Set(catalogo.filter(c=>c.dodo_id===id).map(c=>Number(c.id)));
 return ordenes.filter(o=>o.estado==="Finalizado").flatMap(o=>o.rappi_lineas.filter(l=>ids.has(Number(l.producto_id))&&Number(l.cantidad)>0).map(l=>({
  orden:o.rappi_id,fecha:o.fecha,hora:o.hora,tienda:o.tienda_id,sucursal:o.sucursal_id,archivo:o.archivo,
  nombre:l.nombre,opciones:l.opciones,cantidad:Number(l.cantidad),importe:Number(l.importe),precio:Math.round(Number(l.importe)/Number(l.cantidad)*100)/100,
 }))).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora)||b.orden.localeCompare(a.orden));
}
