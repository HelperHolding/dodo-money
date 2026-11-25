import { pesos } from "@/lib/formato";
import type { ItemApertura } from "@/lib/aperturas";
import { cortePresupuesto } from "@/lib/cortePresupuesto";

// Corte de presupuesto del proyecto en tabla Akton (sin colores): adquirido, cotizado y supuesto contra el total sin IVA.
export function CortePresupuesto({items}:{items:ItemApertura[]}) {
  const c=cortePresupuesto(items);
  if(!c)return null;
  const pct=(n:number)=>`${(n/c.total_sin_iva*100).toFixed(1)} %`;
  const renglones=[{nombre:"Adquirido",monto:c.adquirido,nota:"No confirma pago ni recepción."},{nombre:"Cotizado / confirmado",monto:c.cotizado,nota:""},{nombre:"Falta cotizar · supuesto",monto:c.supuesto,nota:"Pendiente de cotización oficial."}];
  return <div className="akton"><section className="akton-tabla-marco" id="corte-presupuesto" aria-labelledby="ap-corte">
    <h2 id="ap-corte" className="akton-titulo">Presupuesto del proyecto</h2>
    <p className="akton-subtitulo">Corte {c.fecha.split('-').reverse().join('/')} · {pesos(c.total_con_iva)} con IVA · {pesos(c.total_sin_iva)} sin IVA</p>
    <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla">
      <thead><tr><th>Renglón</th><th>Monto sin IVA</th><th>% del presupuesto</th><th>Notas</th></tr></thead>
      <tbody>{renglones.map(r=><tr key={r.nombre}><td data-label="Renglón">{r.nombre}</td><td data-label="Monto sin IVA" className="ap-crono-fecha">{pesos(r.monto)}</td><td data-label="% del presupuesto" className="akton-pct">{pct(r.monto)}</td><td data-label="Notas" className="akton-nota-celda">{r.nota&&<p className="akton-nota">{r.nota}</p>}</td></tr>)}
        <tr className="akton-subtotal"><td data-label="Renglón">Total sin IVA</td><td data-label="Monto sin IVA" className="ap-crono-fecha">{pesos(c.total_sin_iva)}</td><td data-label="% del presupuesto">100 %</td><td data-label="Notas"/></tr>
      </tbody>
    </table></div>
    <details><summary>Desglose y puntos por cerrar</summary><div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla"><thead><tr><th>Concepto</th><th>Adquirido</th><th>Cotizado</th><th>Supuesto</th><th>Total sin IVA</th></tr></thead><tbody>{c.desglose.map(r=><tr key={r.concepto}><td data-label="Concepto">{r.concepto}</td><td data-label="Adquirido">{pesos(r.adquirido)}</td><td data-label="Cotizado">{pesos(r.cotizado)}</td><td data-label="Supuesto">{pesos(r.supuesto)}</td><td data-label="Total sin IVA">{pesos(r.total)}</td></tr>)}</tbody></table></div>
      <ul><li>Obra César: $1.3 millones sin IVA como supuesto; falta cotización oficial.</li><li>JMF: validar cámara, campana y diferencias de medidas y cantidades en repisas.</li><li>Atosa: cotización con vencimiento 19/10/2026; validar espacio, ruedas y maniobras.</li><li>Horno y gabinete: adquiridos según documento, convertidos a TC 18.35; falta confirmar recepción.</li><li>Smallware: estimados sin cotización; opcionales fuera del total por $14,150 sin IVA.</li></ul><small>Fuente: {c.fuente}. El corte conserva todas las hojas del archivo y su huella de origen.</small>
    </details></section></div>;
}
