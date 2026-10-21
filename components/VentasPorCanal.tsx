import {participacionCanales} from "@/lib/ventas/reporte";
import { pesos,porcentaje,fechaTexto } from "@/lib/formato";
import type { CanalReporte } from "@/lib/ventas/reporte";

export function VentasPorCanal({canales,detalle=false}:{canales:CanalReporte[];detalle?:boolean}){
 const participaciones=participacionCanales(canales.map(c=>c.actual.total));
 return <><section className="seccion"><h2>Ventas por canal</h2>
 <p className="saldo-nota">Separación por fuente: POS / Dodo IS y órdenes Rappi importadas marcadas para sumar. Rappi usa el subtotal del restaurante; no es el depósito recibido ni la liquidación después de comisiones.</p>
 <div className="tabla-contenedor"><table className="tabla tabla-tarjetas">
 <thead><tr><th>Canal</th><th>Venta total con IVA</th><th>% de la venta</th><th>Venta neta sin IVA</th><th>Pedidos</th><th>Ticket promedio</th><th>Costo teórico</th></tr></thead>
 <tbody>{canales.map((c,i)=><tr key={c.clave}><td data-label="Canal"><strong>{c.nombre}</strong></td><td data-label="Venta total con IVA" className="monto">{pesos(c.actual.total)}</td><td data-label="% de la venta" className="monto"><strong>{participaciones[i]===null?"—":porcentaje(participaciones[i]!)}</strong></td><td data-label="Venta neta sin IVA" className="monto">{pesos(c.actual.neta)}</td><td data-label="Pedidos" className="monto">{c.actual.pedidos}</td><td data-label="Ticket promedio" className="monto">{c.actual.ticket===null?"—":pesos(c.actual.ticket)}</td><td data-label="Costo teórico" className="monto">{c.actual.costoPct===null?"—":porcentaje(c.actual.costoPct)}</td></tr>)}</tbody>
 </table></div>
 </section>
 {detalle&&canales.map(c=><section className="seccion" key={c.clave}><h2>Venta por día · {c.nombre}</h2>
 {!c.dias.length?<p className="vacio">Sin ventas importadas para este canal en el periodo.</p>:<div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><thead><tr><th>Fecha</th><th>Pedidos</th><th>Venta con IVA</th><th>IVA</th><th>Ticket</th></tr></thead><tbody>{c.dias.map(d=><tr key={d.fecha}><td data-label="Fecha">{fechaTexto(d.fecha)}</td><td data-label="Pedidos" className="monto">{d.pedidos}</td><td data-label="Venta con IVA" className="monto">{pesos(d.total)}</td><td data-label="IVA" className="monto">{pesos(d.iva)}</td><td data-label="Ticket" className="monto">{d.ticket===null?"—":pesos(d.ticket)}</td></tr>)}</tbody></table></div>}</section>)}</>;
}
