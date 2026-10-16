import {leerRazonesSociales} from "@/lib/compras/razonesSociales";
import {avanceFactura,type RecepcionFactura} from "@/lib/compras/recepcionFactura";
import ListaDocumentos,{type FiltrosCompra} from "./ListaDocumentos";
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX,hoyCalendarioMX } from "@/lib/formato";
import { documentosCompra } from "@/lib/compras/documentosCompra";
import { nombreFactura,type EstadoFactura } from "@/lib/compras/facturas";
import { totalesOrden,avanceOrden,type EstadoOrden } from "@/lib/compras/ordenes";
import type { TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";

type Orden={rfc_receptor:string;id:string;folio:string;estado:EstadoOrden;creado_en:string;proveedor_id:string;sucursal_id:string|null;proveedores:{razon_social:string;nombre_comercial:string|null}|null;sucursales:{nombre:string}|null};
type Factura={creado_en:string;rfc_receptor:string;id:string;serie:string|null;folio:string|null;uuid:string|null;estado:EstadoFactura;fecha_emision:string;proveedor_id:string;sucursal_id:string|null;total:number;saldo:number;vence_el:string;origen:"cfdi"|"manual";tipo:"ingreso"|"egreso";sustituido_por:string|null;proveedores:Orden["proveedores"];sucursales:Orden["sucursales"]};
type Renglon={descripcion:string;orden_id:string;cantidad:number;precio:number;tasa_iva:TasaIva;recibido:number};
type Params=FiltrosCompra & {etapa?:string;estado?:string;q?:string;proveedor?:string;sucursal?:string;canceladas?:string;vista?:string;ok?:string;error?:string};
export default async function Documentos({searchParams}:{searchParams:Promise<Params>}){
 const params=await searchParams;
 const {supabase,perfil}=await obtenerPerfil();
 const [ordenes,facturas,ligas,renglones,{data:proveedores},{data:sucursales}]=await Promise.all([
  leerTodo<Orden>((d,h)=>supabase.from("ordenes_compra").select("rfc_receptor,id,folio,estado,creado_en,proveedor_id,sucursal_id,proveedores(razon_social,nombre_comercial),sucursales(nombre)").order("id").range(d,h).returns<Orden[]>()),
  leerTodo<Factura>((d,h)=>supabase.from("facturas_saldo").select("creado_en,rfc_receptor,id,serie,folio,uuid,estado,fecha_emision,proveedor_id,sucursal_id,total,saldo,vence_el,origen,tipo,sustituido_por,proveedores(razon_social,nombre_comercial),sucursales(nombre)").order("id").range(d,h).returns<Factura[]>()),
  leerTodo<{orden_id:string;factura_id:string}>((d,h)=>supabase.from("factura_ordenes").select("orden_id,factura_id").order("factura_id").order("orden_id").range(d,h)),
  leerTodo<Renglon>((d,h)=>supabase.from("renglones_recibido").select("orden_id,descripcion,cantidad,precio,tasa_iva,recibido").order("id").range(d,h).returns<Renglon[]>()),
  supabase.from("proveedores").select("id,razon_social,nombre_comercial").order("razon_social").returns<{id:string;razon_social:string;nombre_comercial:string|null}[]>(),
  supabase.from("sucursales").select("id,nombre").order("nombre").returns<{id:string;nombre:string}[]>(),
 ]);
 const razones=await leerRazonesSociales(supabase);
 const empresas=new Map(razones.map(e=>[e.rfc,e.razon_social]));
 const porOrden=new Map<string,Renglon[]>();for(const r of renglones){const rs=porOrden.get(r.orden_id)??[];rs.push(r);porOrden.set(r.orden_id,rs);}
 const base=(d:Orden|Factura)=>({rfc_receptor:d.rfc_receptor,empresa:empresas.get(d.rfc_receptor)??d.rfc_receptor,id:d.id,proveedor_id:d.proveedor_id,proveedor:d.proveedores?.nombre_comercial??d.proveedores?.razon_social??"Sin proveedor",sucursal_id:d.sucursal_id,destino:d.sucursales?.nombre??"Oficina"});
 const filas=documentosCompra(ordenes.map(o=>({...base(o),articulos:(porOrden.get(o.id)??[]).map(r=>r.descripcion),nombre:o.folio,estado:o.estado,recepcion:avanceOrden(porOrden.get(o.id)??[]),fecha:fechaMX(o.creado_en),importe:totalesOrden(porOrden.get(o.id)??[]).total})),facturas.map(f=>({...base(f),registrado_en:f.creado_en,nombre:nombreFactura(f),estado:f.estado,fecha:f.fecha_emision,importe:Number(f.total),saldo:Number(f.saldo),vence_el:f.vence_el,tipo:f.tipo,origen:f.origen,sustituido_por:f.sustituido_por})),ligas,hoyCalendarioMX());
 const [recepcionesDirectas,conceptosDirectos]=await Promise.all([
 leerTodo<RecepcionFactura>((d,h)=>supabase.from("factura_recepciones").select("*").is("anulada_en",null).order("id").range(d,h)),
 leerTodo<{id:number;factura_id:string;cantidad:number;descripcion:string}>((d,h)=>supabase.from("factura_conceptos").select("id,factura_id,cantidad,descripcion").order("id").range(d,h)),
 ]);
 const conceptosDe=new Map<string,string[]>();for(const c of conceptosDirectos)conceptosDe.set(c.factura_id,[...(conceptosDe.get(c.factura_id)??[]),c.descripcion]);
 for(const fila of filas)if(fila.etapa==='factura')fila.articulos=conceptosDe.get(fila.id)??[];
 for(const fila of filas)if(fila.etapa==="factura"&&!fila.notaCredito&&!fila.ordenes.length){const rec=recepcionesDirectas.filter(r=>r.factura_id===fila.id);if(rec.length)fila.recepcion=avanceFactura(conceptosDirectos.filter(c=>c.factura_id===fila.id),rec);}

 return <>
  <div className="encabezado compra-cabecera"><div><p className="compra-sobretitulo">DOCUMENTOS DE COMPRA</p><h1>Compras y facturas</h1><p>Cotizaciones, órdenes y facturas en un mismo lugar. También puedes registrar facturas directamente.</p></div>{puedeEditarCompras(perfil.rol)&&<div className="acciones"><Link className="boton" href="/compras/ordenes/nueva">+ Nueva cotización</Link><Link className="boton boton-secundario" href="/compras/facturas/subir">Subir CFDI</Link><Link className="boton boton-secundario" href="/compras/facturas/nueva">Sin CFDI</Link></div>}</div>
  <p><Link href="/compras/razones-sociales">Razones sociales del grupo</Link></p><Aviso ok={params.ok} error={params.error}/>
  <ListaDocumentos empresas={razones.map(e=>({rfc:e.rfc,nombre:e.razon_social}))} filas={filas} inicial={params} proveedores={proveedores??[]} sucursales={sucursales??[]}/>
 </>;
}
