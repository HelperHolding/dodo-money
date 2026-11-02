import { ConInfo } from '@/components/ConInfo';
import { pesos, porcentaje } from '@/lib/formato';

/** Meta global acordada: $125,000 netos por semana, más IVA del 16 %. */
export function ResumenEjecutivoVentas({desde,hasta,total,piezas,pedidos,global}:{desde:string;hasta:string;total:number;piezas:number;pedidos:number;global:boolean}) {
 const dias=Math.round((Date.parse(`${hasta}T12:00:00Z`)-Date.parse(`${desde}T12:00:00Z`))/86400000)+1;
 const meta=Math.round(14500000*dias/7)/100;
 return <section className="seccion" aria-labelledby="meta-ventas">
  <h2 id="meta-ventas">Resumen ejecutivo</h2>
  {global?<><div className="resumen-meta"><h3>Cumplimiento del periodo: {porcentaje(total/meta)}</h3><progress className="meta-barra" aria-label="Cumplimiento de meta" value={Math.min(total,meta)} max={meta}/><p>Venta {pesos(total)} / meta {pesos(meta)} con IVA · {total>=meta?'Excedente':'Faltante'} {pesos(Math.abs(total-meta))}</p></div><ConInfo titulo="Cumplimiento del periodo" etiqueta="Cómo leer esto">Meta proporcional a los {dias} días seleccionados, incluidos días sin importación. No es una proyección de cierre.</ConInfo></>:<p className="saldo-nota">La meta es global. Selecciona todas las sucursales para ver el cumplimiento; todavía no hay metas individuales.</p>}
  <div className="resumen-cifras">
   <div><div className="resumen-cabeza"><h3>Unidades vendidas</h3><ConInfo titulo="Unidades vendidas">Según productos con detalle importado.</ConInfo></div><strong className="indicador-valor">{piezas.toLocaleString('es-MX')}</strong></div>
   <div><div className="resumen-cabeza"><h3>Productos por pedido</h3><ConInfo titulo="Productos por pedido">Puede ser parcial cuando faltan renglones de productos.</ConInfo></div><strong className="indicador-valor">{pedidos?(piezas/pedidos).toLocaleString('es-MX',{maximumFractionDigits:2}):'—'}</strong></div>
   <div><h3>Meta semanal del negocio</h3><strong className="indicador-valor">{pesos(145000)}</strong><p>$125,000 más IVA · lunes a domingo.</p></div>
  </div>
 </section>;
}
