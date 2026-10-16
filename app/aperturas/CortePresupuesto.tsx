import { pesos } from "@/lib/formato";
import type { ItemApertura } from "@/lib/aperturas";
import { cortePresupuesto } from "@/lib/cortePresupuesto";
export function CortePresupuesto({items}:{items:ItemApertura[]}) {
  const c=cortePresupuesto(items);
  if(!c)return null;
  const grupos=[{nombre:"Adquirido",monto:c.adquirido,color:"var(--info)",tono:"info"},{nombre:"Cotizado / confirmado",monto:c.cotizado,color:"var(--cuadra)",tono:"cuadra"},{nombre:"Falta cotizar · supuesto",monto:c.supuesto,color:"var(--ambar)",tono:"ambar"}];
  return <section className="seccion" id="corte-presupuesto"><h2>Presupuesto del proyecto</h2><p>Corte {c.fecha.split('-').reverse().join('/')} · {pesos(c.total_con_iva)} con IVA · {pesos(c.total_sin_iva)} sin IVA</p>
    <div className="rejilla">{grupos.map(g=><div key={g.nombre} className="saldo" data-tono={g.tono}><span>{g.nombre}</span><span className="saldo-monto">{pesos(g.monto)}</span><small className="saldo-nota">{(g.monto/c.total_sin_iva*100).toFixed(1)}% del presupuesto sin IVA</small></div>)}</div>
    <div className="barra-apilada" aria-hidden="true">{grupos.map(g=><div key={g.nombre} style={{background:g.color,width:`${g.monto/c.total_sin_iva*100}%`}}/>)}</div>
    <p>Lo adquirido no confirma pago ni recepción. Los importes supuestos siguen pendientes de cotización oficial.</p>
    <details><summary>Desglose y puntos por cerrar</summary><div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Concepto</th><th>Adquirido</th><th>Cotizado</th><th>Supuesto</th><th>Total sin IVA</th></tr></thead><tbody>{c.desglose.map(r=><tr key={r.concepto}><td>{r.concepto}</td><td>{pesos(r.adquirido)}</td><td>{pesos(r.cotizado)}</td><td>{pesos(r.supuesto)}</td><td>{pesos(r.total)}</td></tr>)}</tbody></table></div>
      <ul><li>Obra César: $1.3 millones sin IVA como supuesto; falta cotización oficial.</li><li>JMF: validar cámara, campana y diferencias de medidas y cantidades en repisas.</li><li>Atosa: cotización con vencimiento 19/10/2026; validar espacio, ruedas y maniobras.</li><li>Horno y gabinete: adquiridos según documento, convertidos a TC 18.35; falta confirmar recepción.</li><li>Smallware: estimados sin cotización; opcionales fuera del total por $14,150 sin IVA.</li></ul><small>Fuente: {c.fuente}. El corte conserva todas las hojas del archivo y su huella de origen.</small>
    </details></section>;
}
