import type { Hoja } from "./xlsx";
import type { VentaDia, VentaProducto } from "./calculos";
import type { Pedido, LineaPedido } from "./pedidos";
import type {TipoDesglose} from "./extraer";
import {createHash} from "node:crypto";
export type OrdenRappi = { rappi_id:string;tienda_id:string;fecha:string;hora:string;estado:"Finalizado"|"Cancelado"|"Con reclamo";pago:string;bruto:number;descuento_restaurante:number;subtotal_restaurante:number;descuento_rappi:number;facturar:number };
export type ProductoRappi = {rappi_id:string;linea:number;nombre:string;opciones:string;cantidad:number;importe:number;clave:string};
export type RappiGuardada = OrdenRappi & {sucursal_id:string;sumar:boolean;archivo:string;registrado_en:string;rappi_lineas:(Omit<ProductoRappi,"clave"> & {producto_id:number})[]};
export type CatalogoRappi = {id:number;clave:string;nombre:string;dodo_id:number|null};
const centavos=(n:number)=>Math.round(n*100)/100;
export function resumenPanelRappi(ordenes:readonly RappiGuardada[]) {
 const sumadas=ordenes.filter(o=>o.estado==='Finalizado'&&o.sumar);
 const total=centavos(sumadas.reduce((s,o)=>s+Number(o.subtotal_restaurante),0));
 const dias=new Map<string,{fecha:string;total:number;ordenes:number}>();
 const productos=new Map<string,{nombre:string;cantidad:number;importe:number}>();
 for(const o of sumadas){const d=dias.get(o.fecha)??{fecha:o.fecha,total:0,ordenes:0};d.total=centavos(d.total+Number(o.subtotal_restaurante));d.ordenes++;dias.set(o.fecha,d);
  for(const p of o.rappi_lineas){const key=JSON.stringify([p.nombre,p.opciones]),r=productos.get(key)??{nombre:p.nombre+(p.opciones?` · ${p.opciones}`:''),cantidad:0,importe:0};r.cantidad+=Number(p.cantidad);r.importe=centavos(r.importe+Number(p.importe));productos.set(key,r);}
 }
 return {cantidad:sumadas.length,total,ticket:sumadas.length?centavos(total/sumadas.length):null,descuentoRestaurante:centavos(sumadas.reduce((s,o)=>s+Number(o.descuento_restaurante),0)),descuentoRappi:centavos(sumadas.reduce((s,o)=>s+Number(o.descuento_rappi),0)),dias:[...dias.values()].sort((a,b)=>a.fecha.localeCompare(b.fecha)),productos:[...productos.values()].sort((a,b)=>b.cantidad-a.cantidad||a.nombre.localeCompare(b.nombre)).slice(0,5),estados:(['Finalizado','Cancelado','Con reclamo'] as const).map(estado=>({estado,cantidad:ordenes.filter(o=>o.estado===estado).length})),enDodo:ordenes.filter(o=>o.estado==='Finalizado'&&!o.sumar).length};
}
const normal=(s:string)=>s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
function tabla(hojas:readonly Hoja[],nombre:string,campos:readonly string[]) {
  const candidatas=hojas.filter(h=>h.nombre===nombre);
  if(candidatas.length!==1)throw Error(`Falta la hoja ${nombre} del Excel construido desde el historial.`);
  const filas=new Map<number,Map<string,string|number>>();
  for(const [ref,v] of candidatas[0].celdas){const m=/^([A-Z]+)(\d+)$/.exec(ref);if(!m)continue;const n=Number(m[2]);if(!filas.has(n))filas.set(n,new Map());filas.get(n)!.set(m[1],v);}
  const columnas=new Map([...(filas.get(1)??[])].map(([c,v])=>[String(v),c]));
  if(campos.some(c=>!columnas.has(c)))throw Error(`Revisa los encabezados de ${nombre}.`);
  return [...filas].filter(([n,r])=>n>1&&[...r.values()].some(v=>String(v).trim())).sort((a,b)=>a[0]-b[0]).map(([n,r])=>({n,valor:(c:string)=>String(r.get(columnas.get(c)!)??"").trim()}));
}
const importe=(s:string)=>{if(!/^\d+(\.\d{1,2})?$/.test(s)||Number(s)>=1e12)throw Error("Monto inválido: usa pesos, sin signos, con hasta dos decimales.");return Number(s);};
export function leerHistorialRappi(hojas:readonly Hoja[],hoy:string) {
  const ordenes:OrdenRappi[]=[],productos:ProductoRappi[]=[],ids=new Set<string>(),lineas=new Set<string>();
  for(const {n,valor:v} of tabla(hojas,"Ordenes",["ID orden","ID tienda","Fecha","Hora","Estado","Pago","Importe productos","Descuento restaurante","Subtotal restaurante","Descuento Rappi","Total a facturar"])){
    const id=v("ID orden"),fecha=v("Fecha"),hora=v("Hora"),estado=v("Estado"),tienda=v("ID tienda");
    if(!/^\d{5,20}$/.test(id)||ids.has(id)||!/^MX\d+$/.test(tienda)||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!Number.isFinite(Date.parse(fecha))||new Date(fecha).toISOString().slice(0,10)!==fecha||fecha>hoy||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)||!["Finalizado","Cancelado","Con reclamo"].includes(estado)||!v("Pago")||v("Pago").length>120)throw Error(`Revisa ID, fecha, hora y estado en Ordenes, fila ${n}.`);
    ids.add(id);const bruto=importe(v("Importe productos")),descuento_restaurante=importe(v("Descuento restaurante")),subtotal_restaurante=importe(v("Subtotal restaurante")),descuento_rappi=importe(v("Descuento Rappi")),facturar=importe(v("Total a facturar"));
    if(centavos(bruto-descuento_restaurante)!==subtotal_restaurante||centavos(subtotal_restaurante-descuento_rappi)!==facturar)throw Error(`Los descuentos no cuadran en la orden ${id}.`);
    ordenes.push({rappi_id:id,tienda_id:tienda,fecha,hora,estado:estado as OrdenRappi["estado"],pago:v("Pago"),bruto,descuento_restaurante,subtotal_restaurante,descuento_rappi,facturar});
  }
  if(!ordenes.length||ordenes.length>5000||new Set(ordenes.map(o=>o.tienda_id)).size!==1)throw Error("Importa de 1 a 5000 órdenes de una sola tienda de Rappi.");
  for(const {n,valor:v} of tabla(hojas,"Productos",["ID orden","Renglon","Producto","Opciones","Cantidad","Importe renglon"])){
    const rappi_id=v("ID orden"),linea=Number(v("Renglon")),cantidad=Number(v("Cantidad")),nombre=v("Producto"),opciones=v("Opciones"),k=`${rappi_id}|${linea}`;
    if(!ids.has(rappi_id)||!Number.isSafeInteger(linea)||linea<1||lineas.has(k)||!Number.isSafeInteger(cantidad)||cantidad<1||cantidad>10000||!nombre||nombre.length>500||opciones.length>1000)throw Error(`Revisa Productos, fila ${n}.`);
    lineas.add(k);productos.push({rappi_id,linea,nombre,opciones,cantidad,importe:importe(v("Importe renglon")),clave:createHash("sha256").update(JSON.stringify([normal(nombre),normal(opciones)])).digest("hex")});
  }
  if(productos.length>50000||productos.reduce((n,p)=>n+p.cantidad,0)>100000)throw Error("Exporta un periodo más corto.");
  for(const o of ordenes){const filas=productos.filter(p=>p.rappi_id===o.rappi_id);if(!filas.length||filas.length>200||centavos(filas.reduce((n,p)=>n+p.importe,0))!==o.bruto)throw Error(`Los productos no cuadran con la orden ${o.rappi_id}, o exceden 200 renglones.`);}
  return {ordenes,productos};
}
const CAMPOS_ORDEN=[["ID orden","rappi_id"],["ID tienda","tienda_id"],["Fecha","fecha"],["Hora","hora"],["Estado","estado"],["Pago","pago"],["Importe productos","bruto"],["Descuento restaurante","descuento_restaurante"],["Subtotal restaurante","subtotal_restaurante"],["Descuento Rappi","descuento_rappi"],["Total a facturar","facturar"]] as const;
const CAMPOS_PRODUCTO=[["ID orden","rappi_id"],["Renglon","linea"],["Producto","nombre"],["Opciones","opciones"],["Cantidad","cantidad"],["Importe renglon","importe"]] as const;
function hojaDesde(nombre:string,campos:readonly (readonly [string,string])[],filas:unknown):Hoja{
  if(!Array.isArray(filas)||filas.length>50000)throw Error(`${nombre} debe ser una lista.`);
  const celdas=new Map<string,string|number>();
  campos.forEach(([titulo],j)=>celdas.set(`${String.fromCharCode(65+j)}1`,titulo));
  filas.forEach((f,i)=>{if(!f||typeof f!=="object")throw Error(`${nombre}: renglón ${i+1} inválido.`);campos.forEach(([,clave],j)=>{const v=(f as Record<string,unknown>)[clave];if(typeof v==="string"||typeof v==="number")celdas.set(`${String.fromCharCode(65+j)}${i+2}`,v);});});
  return {nombre,celdas};
}
/** Misma validación que el Excel, para órdenes enviadas como JSON por el extractor del portal. */
export function leerJsonRappi(datos:{ordenes?:unknown;productos?:unknown},hoy:string){
  return leerHistorialRappi([hojaDesde("Ordenes",CAMPOS_ORDEN,datos.ordenes),hojaDesde("Productos",CAMPOS_PRODUCTO,datos.productos)],hoy);
}
/** Subtotal restaurante es la base seleccionada; el descuento financiado por Rappi se conserva por separado. */
export function ventasRappi(ordenes:readonly RappiGuardada[],catalogo:readonly CatalogoRappi[]) {
  const dias=new Map<string,VentaDia>(),productos:VentaProducto[]=[],pedidos:(Pedido & {sucursal_id:string})[]=[],lineas:LineaPedido[]=[];
  const sku=new Map(catalogo.map(c=>[Number(c.id),c]));
  for(const o of ordenes.filter(o=>o.sumar&&o.estado==="Finalizado")){
    const total=Number(o.subtotal_restaurante),iva=centavos(total*16/116),k=`${o.sucursal_id}|${o.fecha}`;
    const d=dias.get(k)??{sucursal_id:o.sucursal_id,fecha:o.fecha,pedidos:0,total:0,efectivo:0,tarjeta:0,en_linea:0,iva:0,venta_m2:null};
    d.pedidos++;d.total=centavos(d.total+total);d.en_linea=d.total;d.iva=centavos(d.iva+iva);dias.set(k,d);
    const id=`rappi:${o.rappi_id}`;
    pedidos.push({dodo_id:id,sucursal_id:o.sucursal_id,fecha:o.fecha,hora:o.hora.slice(0,5),pago:"en_linea",tipo:"entrega",origen:"otro",para_llevar:false,estado:"entregado",total,total_sin_descuento:Number(o.bruto),agregador:"Rappi",inicio_coccion:null,listo:null,entregado:null});
    let asignado=0;
    o.rappi_lineas.forEach((p,i)=>{const importe=i===o.rappi_lineas.length-1?centavos(total-asignado):Math.min(centavos(total-asignado),centavos(Number(o.bruto)?total*Number(p.importe)/Number(o.bruto):0));asignado=centavos(asignado+importe);
      const c=sku.get(Number(p.producto_id)),nombre=`${p.nombre}${p.opciones?` · ${p.opciones}`:""}`;
      productos.push({sucursal_id:o.sucursal_id,fecha:o.fecha,dodo_id:c?.dodo_id??-Number(p.producto_id),nombre,cantidad:Number(p.cantidad),importe,importe_sin_descuento:Number(p.importe)});
      let piezasAsignadas=0;
      for(let j=0;j<Number(p.cantidad);j++){const precio=j===Number(p.cantidad)-1?centavos(importe-piezasAsignadas):Math.min(centavos(importe-piezasAsignadas),centavos(importe/Number(p.cantidad)));piezasAsignadas=centavos(piezasAsignadas+precio);lineas.push({pedido_id:id,nombre,precio,combo:null});}
    });
  }
  return {dias:[...dias.values()],productos,pedidos,lineas};
}
type DiaDesglose=VentaDia & {ventas_dia_desglose:{tipo:TipoDesglose;pedidos:number;total:number}[]};
export function combinarDiasRappi(dodo:readonly DiaDesglose[],rappi:readonly VentaDia[]):DiaDesglose[]{
  const dias=new Map(dodo.map(d=>[`${d.sucursal_id}|${d.fecha}`,{...d,ventas_dia_desglose:d.ventas_dia_desglose.map(x=>({...x}))}]));
  for(const r of rappi){const k=`${r.sucursal_id}|${r.fecha}`,d=dias.get(k);if(!d){dias.set(k,{...r,ventas_dia_desglose:[{tipo:"entrega",pedidos:r.pedidos,total:r.total},{tipo:"agregador",pedidos:r.pedidos,total:r.total}]});continue;}
    const total=Number(d.total);d.total=centavos(total+r.total);d.pedidos+=r.pedidos;d.en_linea=centavos(Number(d.en_linea)+r.en_linea);d.iva=centavos(Number(d.iva)+r.iva);d.venta_m2=d.venta_m2!==null&&total>0?centavos(d.venta_m2*d.total/total):null;
    for(const tipo of ["entrega","agregador"] as const){const x=d.ventas_dia_desglose.find(x=>x.tipo===tipo);if(x){x.pedidos+=r.pedidos;x.total=centavos(Number(x.total)+r.total);}else d.ventas_dia_desglose.push({tipo,pedidos:r.pedidos,total:r.total});}
  }
  return [...dias.values()];
}
