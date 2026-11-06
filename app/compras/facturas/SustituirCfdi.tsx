"use client";
import {useActionState} from 'react';
import {BotonEnviar} from '@/components/BotonEnviar';
import {prepararSustitucionCfdi,confirmarSustitucionCfdi,type VistaSustitucionCfdi} from './sustitucion';
import {avisoComplementos,avisoRelacion,diferenciasImportes} from '@/lib/compras/sustitucionCfdi';
import {pesos} from '@/lib/formato';
export function SustituirCfdi({id,uuid,folio}:{id:string;uuid:string;folio:string}) {
 const [vista,accion]=useActionState<VistaSustitucionCfdi,FormData>(prepararSustitucionCfdi,null);
 const d=vista?.datos;
 const difs=d?diferenciasImportes(d.original,d.importes):[];
 const avisos=d?[avisoRelacion(uuid,d.relacionados),avisoComplementos(d.complementos,d.metodo)].filter((x):x is string=>!!x):[];
 return <details className="orden-accion-desplegable"><summary className="boton boton-secundario">Sustituir CFDI</summary><div className="orden-accion-formulario">
  <p>Cuando el proveedor cancela este CFDI y timbra otro, sube aquí el XML nuevo. Se conserva el mismo registro con sus pagos, órdenes y recepciones; el CFDI actual ({folio}) queda en el historial.</p>
  <form action={accion} className="formulario"><input type="hidden" name="id" value={id}/>
   <label className="campo">XML del CFDI nuevo<input type="file" name="xml" accept=".xml" required/></label>
   <label className="campo">PDF del CFDI nuevo (opcional)<input type="file" name="pdf" accept=".pdf,application/pdf"/></label>
   <label className="campo">Motivo<input name="motivo" required minLength={5} maxLength={500} placeholder="El proveedor canceló el folio anterior y timbró uno nuevo"/></label>
   <small>Hasta 4 MB por archivo. Revisa la vista previa antes de confirmar.</small><BotonEnviar pendiente="Revisando XML…">Revisar XML</BotonEnviar>
  </form>
  {vista?.error&&<p className="aviso" role="alert">{vista.error}</p>}
  {d&&<section><h3>Vista previa</h3>
   <ul className="lista-simple">
    <li><strong>Anterior:</strong> {folio} · UUID {uuid}</li>
    <li><strong>Nuevo:</strong> {d.folio||'Sin folio'} · UUID {d.uuid}</li>
    <li><strong>Emisor:</strong> {d.emisor}</li>
    <li><strong>Emisión:</strong> {d.fecha} · {d.metodo??'Sin método'}</li>
    <li><strong>Total:</strong> {pesos(d.total)}{difs.length?'':' · igual al registrado'}</li>
    <li><strong>Pagado:</strong> {pesos(d.pagado)} · se conserva</li>
    <li><strong>PDF:</strong> {d.pdf?'Se reemplaza con el PDF nuevo':'Sin PDF nuevo; el anterior queda en el historial'}</li>
   </ul>
   {difs.length>0&&<ul className="lista-simple">{difs.map(x=><li key={x.campo}>{x.nombre}: {pesos(x.registrado)} → {pesos(x.xml)} ({x.diferencia>0?'+':''}{pesos(x.diferencia)})</li>)}</ul>}
   {d.pagado>d.total&&<p role="alert" className="aviso">Los pagos superan el total del XML por {pesos(d.pagado-d.total)}. Revisa la diferencia con el proveedor; no se genera una devolución automática.</p>}
   {avisos.map(a=><p key={a} className="saldo-nota">{a}</p>)}
   <form action={confirmarSustitucionCfdi}>
    {difs.length>0&&<label className="campo"><span role="alert">Los importes cambian. Se corregirán con el XML como fuente de verdad; el original queda en el historial y los pagos no cambian.</span><span><input type="checkbox" name="aceptar_ajuste" required/> Acepto corregir los importes con el XML.</span></label>}
    <input type="hidden" name="id" value={id}/><input type="hidden" name="solicitud" value={d.solicitud}/>
    <BotonEnviar confirmar={`¿Sustituir el CFDI ${folio} por ${d.folio||d.uuid}?`} pendiente="Sustituyendo…">Confirmar sustitución</BotonEnviar>
   </form>
  </section>}
 </div></details>;
}
