"use client";
import {useActionState} from 'react';
import {BotonEnviar} from '@/components/BotonEnviar';
import {prepararXmlPrefactura,confirmarXmlPrefactura,type VistaXmlPrefactura} from './conversion';
import {pesos} from '@/lib/formato';
const campos=[['subtotal','Subtotal'],['descuento','Descuento'],['iva','IVA'],['retencion_iva','Retención IVA'],['retencion_isr','Retención ISR'],['retenciones','Retenciones'],['total','Total']] as const;
export function ConvertirPrefactura({id}:{id:string}) {
 const [vista,accion]=useActionState<VistaXmlPrefactura,FormData>(prepararXmlPrefactura,null);
 return <details className="orden-accion-desplegable"><summary className="boton boton-secundario">Convertir con XML</summary><div className="orden-accion-formulario">
  <p>Asocia el CFDI a esta prefactura conservando el mismo registro, pagos, órdenes y recepciones.</p>
  <form action={accion} className="formulario"><input type="hidden" name="id" value={id}/>
   <label className="campo">XML del CFDI<input type="file" name="xml" accept=".xml" required/></label>
   <label className="campo">Motivo<input name="motivo" required minLength={5} maxLength={500} placeholder="El proveedor entregó el CFDI de esta compra"/></label>
   <small>Hasta 4 MB. Las diferencias se muestran antes de confirmar.</small><BotonEnviar pendiente="Revisando XML…">Revisar XML</BotonEnviar>
  </form>
  {vista?.error&&<p className="aviso" role="alert">{vista.error}</p>}
  {vista?.datos&&<section><h3>Vista previa del CFDI</h3><p>{vista.datos.emisor} · {vista.datos.folio}</p><p>UUID {vista.datos.uuid}</p><p>Emisión {vista.datos.fecha} · Total {pesos(vista.datos.total)}</p><p className="saldo-nota">Se conservan renglones, cuentas y recepciones. El P&amp;L se recalcula con la base fiscal del XML distribuida entre las cuentas existentes. Los conceptos fiscales quedan disponibles en el XML y en «Documentos relacionados».</p>
   <table className="tabla"><thead><tr><th>Importe</th><th>Registrado</th><th>XML</th><th>Diferencia</th></tr></thead><tbody>{campos.map(([campo,nombre])=><tr key={campo}><td>{nombre}</td><td>{pesos(Number(vista.datos!.original[campo]))}</td><td>{pesos(Number(vista.datos!.importes[campo]))}</td><td>{pesos(Number(vista.datos!.importes[campo])-Number(vista.datos!.original[campo]))}</td></tr>)}</tbody></table>
   <p>Pagado: {pesos(vista.datos.pagado)} · Saldo con XML: {pesos(Math.max(0,vista.datos.total-vista.datos.pagado))}</p>
   {vista.datos.pagado>vista.datos.total&&<p role="alert" className="aviso">Los pagos superan el total XML por {pesos(vista.datos.pagado-vista.datos.total)}. Revisa la diferencia con el proveedor; no se genera una devolución automática.</p>}
   <form action={confirmarXmlPrefactura}>{campos.some(([campo])=>Number(vista.datos!.original[campo])!==Number(vista.datos!.importes[campo]))&&<label className="campo"><span role="alert">Se corregirán los importes usando el XML como fuente de verdad. El original queda en el historial. No se cambian pagos ni movimientos de efectivo.</span><span><input type="checkbox" name="aceptar_ajuste" required/> Acepto corregir los importes con el XML.</span></label>}<input type="hidden" name="id" value={id}/><input type="hidden" name="solicitud" value={vista.datos.solicitud}/><BotonEnviar confirmar="¿Convertir esta prefactura a factura con el CFDI mostrado?" pendiente="Convirtiendo…">Confirmar conversión</BotonEnviar></form>
  </section>}
 </div></details>;
}
