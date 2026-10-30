import Link from "next/link";
import {catalogoCosteo} from "../catalogo";
import {cargarRappi} from "@/app/ventas/rappi/datos";
import {leerFinancierosRappi} from "@/app/banca/rappi/datos";
import {preciosPOSDodo} from "../precios";
import {comisionPOSVigente} from "../comision";
import {leerTodo} from "@/lib/ventas/paginar";
import {costoVigente} from "@/lib/ventas/calculos";
import {valorVigente,type Parametro} from "@/lib/finanzas/parametros";
import {rentabilidadRappi} from "@/lib/costeo/rentabilidadRappi";
import {pesos,fechaTexto} from "@/lib/formato";

const pct=(n:number|null)=>n===null?"—":`${n.toLocaleString("es-MX",{maximumFractionDigits:1})} %`;
const estado=(m:number|null,meta:number)=>m===null?undefined:m<0?"negativo":m<meta?"bajo":"ok";
/** Regalías que indicó la dirección (3.5 % sobre venta neta) mientras no haya parámetro capturado. */
const REGALIAS_INDICADAS=3.5;
const META_INICIAL=45;

export default async function RentabilidadRappi({searchParams}:{searchParams:Promise<{mes?:string;meta?:string}>}){
 const q=await searchParams,{supabase,hoy,recetas}=await catalogoCosteo();
 const mes=q.mes&&/^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes)?q.mes:hoy.slice(0,7);
 const desde=`${mes}-01`,finMes=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10),hasta=finMes<hoy?finMes:hoy;
 const meta=q.meta?.trim()&&Number.isFinite(Number(q.meta))&&Number(q.meta)>=0&&Number(q.meta)<100?Number(q.meta):META_INICIAL;
 const [{ordenes,catalogo},productos,costos,params,financieros,preciosPOS,terminal]=await Promise.all([
  cargarRappi(supabase,null,desde,hasta),
  leerTodo<{dodo_id:number;nombre:string}>((a,b)=>supabase.from("productos_venta").select("dodo_id,nombre").order("dodo_id").range(a,b)),
  leerTodo<{dodo_id:number;costo:number;vigente_desde:string}>((a,b)=>supabase.from("costos_producto").select("dodo_id,costo,vigente_desde").lte("vigente_desde",hasta).order("dodo_id").order("vigente_desde",{ascending:false}).range(a,b)),
  leerTodo<Parametro>((a,b)=>supabase.from("pl_parametros").select("clave,valor,vigente_desde").in("clave",["rappi_pct","regalias_pct"]).order("clave").order("vigente_desde").range(a,b).returns<Parametro[]>()),
  leerFinancierosRappi(supabase),
  preciosPOSDodo(supabase,hoy),
  comisionPOSVigente(supabase,hoy),
 ]);
 const sku=new Map(catalogo.map(c=>[Number(c.id),c.dodo_id])),nombres=new Map(productos.map(p=>[p.dodo_id,p.nombre]));
 const costosDe=new Map<number,typeof costos>();for(const c of costos)costosDe.set(c.dodo_id,[...(costosDe.get(c.dodo_id)??[]),c]);
 const regaliasParametro=valorVigente(params,"regalias_pct",hoy)*100,regalias=regaliasParametro>0?regaliasParametro:REGALIAS_INDICADAS;
 // Reporte financiero: comisión cobrada por orden (sin el IVA de la comisión) y compensaciones/cancelaciones del periodo.
 const movimientos=financieros.flatMap(f=>f.reporte.movimientos).filter(m=>m.fecha>=desde&&m.fecha<=hasta);
 const comisionReal=new Map<string,number>();for(const m of movimientos)if(m.tipo==="ORDEN"&&m.comision!==0)comisionReal.set(m.orden,(comisionReal.get(m.orden)??0)-Number(m.comision));
 const ajustes={compensaciones:-movimientos.reduce((s,m)=>s+Number(m.compensacion),0),cancelaciones:-movimientos.reduce((s,m)=>s+Number(m.cancelacion),0)};
 const r=rentabilidadRappi({
  ordenes,comisionReal,ajustes,regaliasPct:regalias,terminalPct:terminal?.pct??0,metaPct:meta,
  productoDe:id=>{const d=sku.get(id);return d==null?null:{dodo_id:d,nombre:nombres.get(d)??`Producto ${d}`};},
  costoDe:(d,fecha)=>{const c=costoVigente(costosDe.get(d)??[],fecha);return c?Number(c.costo):null;},
  posDe:d=>preciosPOS.get(d)?.precio??recetas.find(x=>x.dodo_id===d)?.receta.precioVenta??null,
  comisionPct:fecha=>valorVigente(params,"rappi_pct",fecha)*100,
 });
 const estimadas=r.ordenes-r.ordenesConComisionReal,sinParametro=estimadas>0&&valorVigente(params,"rappi_pct",hasta)===0;
 const t=r.total,abajo=r.filas.filter(f=>f.margen!==null&&f.margen<meta).length;
 return <><div className="encabezado ficha-encabezado"><h1>Rentabilidad Rappi</h1><p>Cuánto deja cada producto en Rappi después del descuento que paga la tienda, la comisión, las regalías y su costo, contra un margen mínimo de {pct(meta)} sobre la venta sin IVA.</p></div>
 <div className="acciones orden-acciones-encabezado"><Link className="boton boton-secundario" href="/ventas/costos">Volver a costeo</Link><Link className="boton boton-secundario" href="/ventas/costos/calculadora?calculadora=promocion">Simular un precio o promo</Link></div>
 <form className="barra-filtros" method="get"><label className="campo">Mes<input type="month" name="mes" defaultValue={mes}/></label><label className="campo">Margen mínimo (%)<input type="number" name="meta" min="0" max="99.99" step="0.01" defaultValue={meta}/></label><button className="boton boton-secundario" type="submit">Ver</button></form>
 {!r.ordenes?<p className="vacio">No hay órdenes Rappi finalizadas del {fechaTexto(desde)} al {fechaTexto(hasta)}.</p>:<>
 {sinParametro&&<p className="aviso">{estimadas} órdenes no están en un reporte financiero y la comisión Rappi del parámetro es 0 %: su comisión queda en cero. Rappi ya cobra 18 %; captúralo en Finanzas → Parámetros o sube el reporte financiero en Banca → Rappi.</p>}
 {regaliasParametro<=0&&<p className="aviso">Sin parámetro de regalías: se usa {pct(REGALIAS_INDICADAS)} sobre la venta sin IVA. Captúralo en Finanzas → Parámetros.</p>}
 {r.sinCosto.productos>0&&<p className="aviso">{r.sinCosto.productos} productos sin costo vigente o sin ligar a un producto ({pesos(r.sinCosto.neto)} sin IVA) quedan fuera de la utilidad y el margen. Lígalos en Ventas → Rappi o registra su costo.</p>}
 <div className="ficha-indicadores"><div><small>Órdenes</small><strong>{r.ordenes}</strong></div><div><small>Venta sin IVA</small><strong>{pesos(t.neto)}</strong></div><div><small>Utilidad del canal</small><strong>{pesos(t.utilidad)}</strong></div><div><small>Margen</small><strong><span className="costeo-chip" data-estado={estado(t.margen,meta)}>{pct(t.margen)}</span></strong></div><div><small>Productos bajo {pct(meta)}</small><strong>{abajo}</strong></div></div>
 <section className="seccion"><h2>Resumen del canal</h2><p className="saldo-nota">{fechaTexto(desde)} a {fechaTexto(hasta)} · productos con costo. Comisión real del reporte financiero en {r.ordenesConComisionReal} de {r.ordenes} órdenes; el resto, con el % de Parámetros.</p>
 <dl className="tarjeta-datos rentabilidad-resumen">
  <dt>Venta a precio de lista, con IVA</dt><dd>{pesos(t.lista)}</dd>
  <dt>Descuentos que paga la tienda</dt><dd>−{pesos(t.descuento)} · {pct(t.lista?t.descuento/t.lista*100:null)}</dd>
  <dt>Cobrado, con IVA</dt><dd>{pesos(t.cobrado)}</dd>
  <dt>Venta sin IVA</dt><dd>{pesos(t.neto)}</dd>
  <dt>Comisión Rappi</dt><dd>−{pesos(t.comision)} · {pct(t.cobrado?t.comision/t.cobrado*100:null)} de lo cobrado</dd>
  <dt>Regalías ({pct(regalias)})</dt><dd>−{pesos(t.regalias)}</dd>
  <dt>Costo de producto</dt><dd>−{pesos(t.costo)}</dd>
  <dt>Utilidad de productos</dt><dd>{pesos(t.utilidadProductos)}</dd>
  <dt>Compensaciones (faltantes y producto en mal estado)</dt><dd>−{pesos(t.compensaciones)}</dd>
  <dt>Cancelaciones cobradas</dt><dd>−{pesos(t.cancelaciones)}</dd>
  <dt><strong>Utilidad del canal</strong></dt><dd><strong>{pesos(t.utilidad)} · {pct(t.margen)}</strong></dd>
 </dl>
 <p className="saldo-nota">El IVA de la comisión y las retenciones de IVA e ISR que descuenta Rappi no se restan: se recuperan en impuestos. Los descuentos que paga Rappi (DAR) no afectan a la tienda.</p></section>
 <section className="seccion"><h2>Por producto</h2><p className="saldo-nota">Margen sobre la venta sin IVA después del descuento promedio que llevó el producto. Precio mínimo: precio de lista con IVA para llegar a {pct(meta)} con ese mismo descuento. Contra mostrador: utilidad por pieza al precio POS, con terminal y regalías.</p>
 <div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><caption className="solo-lector">Rentabilidad Rappi por producto</caption><thead><tr><th scope="col">Producto</th><th scope="col" className="monto">Piezas</th><th scope="col" className="monto">Precio lista</th><th scope="col" className="monto">Descuento</th><th scope="col" className="monto">Utilidad por pieza</th><th scope="col" className="monto">Margen</th><th scope="col" className="monto">Precio mínimo</th><th scope="col" className="monto">En mostrador</th></tr></thead>
 <tbody>{r.filas.map(f=><tr key={f.clave}>
  <td data-label="">{f.dodo_id===null?f.nombre:<Link href={`/ventas/costos/productos/${f.dodo_id}`}>{f.nombre}</Link>}</td>
  <td data-label="Piezas" className="monto">{f.piezas}</td>
  <td data-label="Precio lista" className="monto">{pesos(f.precioLista)}</td>
  <td data-label="Descuento" className="monto">{pct(f.descuentoPct)}</td>
  <td data-label="Utilidad por pieza" className="monto">{f.utilidadPieza===null?<span className="costeo-sin-dato">Sin costo</span>:pesos(f.utilidadPieza)}</td>
  <td data-label="Margen" className="monto">{f.margen===null?<span className="costeo-sin-dato">—</span>:<span className="costeo-chip" data-estado={estado(f.margen,meta)}>{pct(f.margen)}</span>}</td>
  <td data-label="Precio mínimo" className="monto">{f.precioMinimo===null?"—":<span className={f.precioMinimo>f.precioLista?"alerta-texto":undefined}>{pesos(f.precioMinimo)}</span>}</td>
  <td data-label="En mostrador" className="monto">{f.utilidadPOS===null?"—":<>{pesos(f.utilidadPOS)}{f.utilidadPieza!==null&&<small className="costeo-celda">{f.utilidadPieza>=f.utilidadPOS?"Rappi deja más":`Rappi deja ${pesos(f.utilidadPOS-f.utilidadPieza)} menos`}</small>}</>}</td>
 </tr>)}</tbody></table></div></section>
 <section className="seccion"><h2>Descuentos de la tienda por orden</h2><p className="saldo-nota">Cada monto es el descuento que pagó la tienda en una orden (las promos de Rappi suelen ser montos fijos). Total del mes: {pesos(r.promos.reduce((s,p)=>s+p.descuento,0))}.</p>
 <div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><caption className="solo-lector">Descuentos por orden</caption><thead><tr><th scope="col">Descuento por orden</th><th scope="col" className="monto">Órdenes</th><th scope="col" className="monto">Total</th><th scope="col" className="monto">% del precio de lista</th></tr></thead>
 <tbody>{r.promos.map(p=><tr key={p.monto}><td data-label="">{p.monto?pesos(p.monto):"Sin descuento"}</td><td data-label="Órdenes" className="monto">{p.ordenes}</td><td data-label="Total" className="monto">{pesos(p.descuento)}</td><td data-label="% del precio de lista" className="monto">{pct(p.pct)}</td></tr>)}</tbody></table></div></section>
 </>}</>;
}
