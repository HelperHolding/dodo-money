"use client";
import {useActionState} from 'react';
import {BotonEnviar} from '@/components/BotonEnviar';
import {prepararXmlPrefactura,confirmarXmlPrefactura,type VistaXmlPrefactura} from './conversion';
import {pesos} from '@/lib/formato';
export function ConvertirPrefactura({id}:{id:string}) {
 const [vista,accion]=useActionState<VistaXmlPrefactura,FormData>(prepararXmlPrefactura,null);
 return <details className="orden-accion-desplegable"><summary className="boton boton-secundario">Convertir con XML</summary><div className="orden-accion-formulario">
  <p>Asocia el CFDI a esta prefactura conservando el mismo registro, pagos, órdenes y recepciones.</p>
  <form action={accion} className="formulario"><input type="hidden" name="id" value={id}/>
   <label className="campo">XML del CFDI<input type="file" name="xml" accept=".xml" required/></label>
   <label className="campo">Motivo<input name="motivo" required minLength={5} maxLength={500} placeholder="El proveedor entregó el CFDI de esta compra"/></label>
   <small>Hasta 4 MB. Los importes deben coincidir con la prefactura.</small><BotonEnviar pendiente="Revisando XML…">Revisar XML</BotonEnviar>
  </form>
  {vista?.error&&<p className="aviso" role="alert">{vista.error}</p>}
  {vista?.datos&&<section><h3>Vista previa del CFDI</h3><p>{vista.datos.emisor} · {vista.datos.folio}</p><p>UUID {vista.datos.uuid}</p><p>Emisión {vista.datos.fecha} · Total {pesos(vista.datos.total)}</p><p className="saldo-nota">Se conservan los renglones y sus cuentas para no alterar recepciones ni el P&amp;L. Los conceptos fiscales quedan disponibles en el XML y en «Documentos relacionados».</p>
   <form action={confirmarXmlPrefactura}><input type="hidden" name="id" value={id}/><input type="hidden" name="solicitud" value={vista.datos.solicitud}/><BotonEnviar confirmar="¿Convertir esta prefactura a factura con el CFDI mostrado?" pendiente="Convirtiendo…">Confirmar conversión</BotonEnviar></form>
  </section>}
 </div></details>;
}
