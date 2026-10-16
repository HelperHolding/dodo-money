import Link from 'next/link';
import {DatosProveedor} from './DatosProveedor';
import {pesos,fechaTexto} from '@/lib/formato';
export type FacturaTablaPago={id:string;nombre:string;proveedor:string;saldo:number;uuid?:string|null;uuidManual?:boolean;formaPrevista?:string;fechaPago?:string;pdf?:boolean;xml?:boolean;proveedorId?:string;sucursal?:string};
export function TablaFacturasPago({filas,edita=false}:{filas:FacturaTablaPago[];edita?:boolean}){
 return <div className="pagos-tabla-marco"><table className="tabla pagos-tabla"><caption className="solo-lector">Facturas pendientes de pago</caption><thead><tr><th>Número de factura</th><th>Proveedor y sucursal</th><th>UUID</th><th>Saldo a pagar</th><th>Tipo de pago previsto</th><th>Documentos</th></tr></thead><tbody>{filas.map(f=><tr key={f.id}>
 <td data-etiqueta="Número de factura"><Link href={`/compras/facturas/${f.id}`}>{f.nombre}</Link>{f.fechaPago&&<small className="compra-origen">Pago: {fechaTexto(f.fechaPago)}</small>}</td>
 <td data-etiqueta="Proveedor y sucursal">{f.proveedor}{f.sucursal&&<small className="compra-origen">{f.sucursal}</small>}{f.proveedorId&&<DatosProveedor id={f.proveedorId}/>}</td>
 <td data-etiqueta="UUID" className="pagos-uuid">{f.uuid??'Sin UUID'}{f.uuidManual&&<small className="compra-origen">Capturado manualmente · XML pendiente</small>}</td>
 <td data-etiqueta="Saldo a pagar"><strong>{pesos(f.saldo)}</strong></td><td data-etiqueta="Tipo de pago previsto">{f.formaPrevista??'Por definir'}</td>
 <td data-etiqueta="Documentos"><div className="acciones">{f.pdf?<a className="boton boton-secundario" href={`/compras/facturas/${f.id}/archivo?tipo=pdf`} target="_blank" rel="noreferrer">PDF proveedor</a>:<small>Sin PDF del proveedor</small>}
 <a className="boton boton-secundario" href={`/compras/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer">PDF Dodo MX</a>
 {f.xml?<a className="boton boton-secundario" href={`/compras/facturas/${f.id}/archivo?tipo=xml`} target="_blank" rel="noreferrer">XML</a>:<small>XML pendiente</small>}
 {edita&&f.proveedorId&&<Link className="boton boton-secundario" href={`/compras/pagos/nuevo?proveedor=${f.proveedorId}&factura=${f.id}`}>Registrar pago</Link>}</div></td>
 </tr>)}</tbody></table></div>;
}
