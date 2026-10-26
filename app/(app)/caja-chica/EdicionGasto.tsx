import {BotonEnviar} from '@/components/BotonEnviar';
import {hoyMX,fechaTexto,pesos} from '@/lib/formato';
import {NOMBRE_CUENTA,CUENTAS_GASTO} from '@/lib/finanzas/cuentas';
import {NOMBRE_ORIGEN} from '@/lib/gastos';
import type {Gasto} from './ListaGastos';
import {administrarGasto} from './administrar';
export type HistorialGasto={id:string;gasto_id:string;autor_id:string;accion:string;motivo:string;antes:Gasto;despues:Gasto;creado_en:string};
export function EdicionGasto({g,personas}:{g:Gasto;personas:Map<string,string>}) {
 const comun=<><input type="hidden" name="id" value={g.id}/><input type="hidden" name="version" value={g.version}/></>;
 return <details><summary>Administrar gasto</summary>
  <details><summary>Editar gasto</summary><form action={administrarGasto} className="formulario">
   {comun}<input type="hidden" name="solicitud" value={crypto.randomUUID()}/><input type="hidden" name="accion" value="editar"/>
   <label>Fecha real<input name="fecha" type="date" defaultValue={g.fecha} max={hoyMX()} required/></label>
   <label>Concepto<input name="concepto" defaultValue={g.concepto} required maxLength={500}/></label>
   <label>Proveedor<input name="proveedor" defaultValue={g.proveedor??''} maxLength={300}/></label>
   <label>Monto<input name="monto" type="number" min="0.01" step="0.01" defaultValue={g.monto} required/></label>
   <label>Origen del dinero<select name="origen" defaultValue={g.origen}>{Object.entries(NOMBRE_ORIGEN).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
   <label>Persona que pagó (solo si salió de un empleado)<select name="pagado_por" defaultValue={g.pagado_por??''}><option value="">No aplica</option>{[...personas].map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></label>
   <label>Comprobante<select name="comprobante" defaultValue={g.comprobante}><option value="cfdi">Factura (CFDI)</option><option value="nota">Nota o ticket</option><option value="sin_comprobante">Sin comprobante</option></select></label>
   <label>UUID (obligatorio con CFDI)<input name="uuid_cfdi" defaultValue={g.uuid_cfdi??''} maxLength={36}/></label>
   <label>Cuenta del P&L<select name="cuenta_pl" defaultValue={g.cuenta_pl??'otros'}>{([...CUENTAS_GASTO,"insumos"] as const).map(c=><option key={c} value={c}>{NOMBRE_CUENTA[c]}</option>)}</select></label>
   <label>Motivo<textarea name="motivo" required minLength={5} maxLength={1000}/></label>
   <p>Se conserva el comprobante original y el historial. Los cambios de monto u origen ajustan el saldo actual; no reescriben cierres anteriores. {g.informativo&&'Este gasto ya estaba cuadrado: sigue siendo informativo y no mueve efectivo.'}</p>
   <BotonEnviar confirmar="¿Guardar la corrección del gasto y su efecto en saldo y P&L?">Guardar corrección</BotonEnviar>
  </form></details>
  <details><summary>Eliminar captura equivocada</summary><form action={administrarGasto} className="formulario">
   {comun}<input type="hidden" name="solicitud" value={crypto.randomUUID()}/><input type="hidden" name="accion" value="eliminar"/>
   <p>El gasto de {pesos(g.monto)} dejará de contar en el P&L y de descontarse del saldo. El registro y sus comprobantes quedarán en Eliminados.</p>
   <label>Motivo de eliminación<textarea name="motivo" required minLength={5} maxLength={1000}/></label>
   <label><input type="checkbox" name="confirmado" value="si" required/> Confirmo que fue una captura equivocada; este importe no debe descontarse.</label>
   <BotonEnviar className="boton boton-alerta" confirmar="¿Eliminar esta captura y corregir su efecto en el saldo y el P&L, conservando el historial?">Eliminar gasto</BotonEnviar>
  </form></details>
 </details>;
}
export function HistorialDelGasto({filas,nombres}:{filas:HistorialGasto[];nombres:Map<string,string>}) {
 if(!filas.length)return null;
 return <details><summary>Historial de cambios ({filas.length})</summary><ul>{filas.map(h=><li key={h.id}>
  <strong>{h.accion==='eliminar'?'Eliminado':'Corregido'}: {h.motivo}</strong><p>{nombres.get(h.autor_id)??'Administración'} · {new Date(h.creado_en).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}</p>
  <p>{fechaTexto(h.antes.fecha)} → {fechaTexto(h.despues.fecha)} · {pesos(h.antes.monto)} → {pesos(h.despues.monto)} · {NOMBRE_ORIGEN[h.antes.origen]} → {NOMBRE_ORIGEN[h.despues.origen]}</p>
 </li>)}</ul></details>;
}
