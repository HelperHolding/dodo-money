import { pesos } from "@/lib/formato";
import type { ItemApertura } from "@/lib/aperturas";
type Corte={fecha:string;fuente:string;total_sin_iva:number;total_con_iva:number;adquirido:number;cotizado:number;supuesto:number;desglose:{concepto:string;adquirido:number;cotizado:number;supuesto:number;total:number}[]};
export function CortePresupuesto({items}:{items:ItemApertura[]}) {
  const registro=items.find(i=>i.clave==="PRE26-CORTE");
  if(!registro)return null;
  const c=registro.original as unknown as Corte;
  if(!Array.isArray(c.desglose)||!Number.isFinite(c.total_sin_iva)||c.total_sin_iva<=0)return null;
  const grupos=[{nombre:"Adquirido",monto:c.adquirido,color:"#2274a5"},{nombre:"Cotizado / confirmado",monto:c.cotizado,color:"#26835b"},{nombre:"Falta cotizar · supuesto",monto:c.supuesto,color:"#bd8b12"}];
  return <section className="seccion"><h2>Presupuesto del proyecto</h2><p>Corte {c.fecha.split('-').reverse().join('/')} · {pesos(c.total_con_iva)} con IVA · {pesos(c.total_sin_iva)} sin IVA</p>
    <div className="rejilla">{grupos.map(g=><div key={g.nombre} style={{borderLeft:`4px solid ${g.color}`,padding:"8px 14px"}}><strong>{g.nombre}</strong><p style={{fontSize:22,margin:"6px 0"}}>{pesos(g.monto)}</p><small>{(g.monto/c.total_sin_iva*100).toFixed(1)}% del presupuesto sin IVA</small></div>)}</div>
    <div style={{display:"flex",height:14,borderRadius:8,overflow:"hidden",marginTop:18}} aria-hidden="true">{grupos.map(g=><div key={g.nombre} style={{background:g.color,width:`${g.monto/c.total_sin_iva*100}%`}}/>)}</div>
    <p>Lo adquirido no confirma pago ni recepción. Los importes supuestos siguen pendientes de cotización oficial.</p>
    <details><summary>Desglose y puntos por cerrar</summary><div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Concepto</th><th>Adquirido</th><th>Cotizado</th><th>Supuesto</th><th>Total sin IVA</th></tr></thead><tbody>{c.desglose.map(r=><tr key={r.concepto}><td>{r.concepto}</td><td>{pesos(r.adquirido)}</td><td>{pesos(r.cotizado)}</td><td>{pesos(r.supuesto)}</td><td>{pesos(r.total)}</td></tr>)}</tbody></table></div>
      <ul><li>Obra César: $1.3 millones sin IVA como supuesto; falta cotización oficial.</li><li>JMF: validar cámara, campana y diferencias de medidas y cantidades en repisas.</li><li>Atosa: cotización con vencimiento 19/10/2026; validar espacio, ruedas y maniobras.</li><li>Horno y gabinete: adquiridos según documento, convertidos a TC 18.35; falta confirmar recepción.</li><li>Smallware: estimados sin cotización; opcionales fuera del total por $14,150 sin IVA.</li></ul><small>Fuente: {c.fuente}. El corte conserva todas las hojas del archivo y su huella de origen.</small>
    </details></section>;
}
