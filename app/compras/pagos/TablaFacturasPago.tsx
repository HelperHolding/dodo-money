import Link from 'next/link';
import {DatosProveedor} from './DatosProveedor';
import {pesos,fechaTexto} from '@/lib/formato';
import {subtotalesPorRazon} from '@/lib/compras/subtotalRazon';
import {agruparPorProveedor} from '@/lib/compras/agruparProveedor';
import {SubtotalesRazon,type FiltroRazon} from './SubtotalesRazon';
export type FacturaTablaPago={id:string;nombre:string;proveedor:string;saldo:number;uuid?:string|null;uuidManual?:boolean;formaPrevista?:string;fechaPago?:string;empresa?:string;rfcReceptor?:string;comprobantes?:{href:string;nombre:string;formato:string}[];xml?:boolean;proveedorId?:string;sucursal?:string};
/** Las facturas de un mismo proveedor van juntas, con un renglón de encabezado que trae cuántas son y el total a pagarle. */
export function TablaFacturasPago({filas,edita=false,filtroRazon}:{filas:FacturaTablaPago[];edita?:boolean;filtroRazon?:FiltroRazon}){
 const grupos=agruparPorProveedor(filas,{clave:f=>f.proveedorId??f.proveedor,nombre:f=>f.proveedor,monto:f=>f.saldo,fecha:f=>f.fechaPago??''});
 return <><SubtotalesRazon grupos={subtotalesPorRazon(filas.map(f=>({monto:f.saldo,rfc:f.rfcReceptor,empresa:f.empresa})))} filtro={filtroRazon}/><div className="pagos-tabla-marco"><table className="tabla pagos-tabla"><caption className="solo-lector">Facturas pendientes de pago, por proveedor</caption><thead><tr><th>Razón social / factura</th><th>Proveedor y sucursal</th><th>UUID</th><th>Saldo a pagar</th><th>Tipo de pago previsto</th><th>Documentos</th></tr></thead>{grupos.map(g=><tbody key={g.clave}>
 <tr className="pagos-grupo"><th colSpan={6} scope="rowgroup"><span>{g.proveedor}</span><small>{g.facturas.length} {g.facturas.length===1?'factura':'facturas'}</small><strong>{pesos(g.total)}</strong>{edita&&g.facturas[0].proveedorId&&g.facturas.length>1&&<Link className="boton boton-secundario boton-compacto" href={`/compras/pagos/nuevo?proveedor=${g.facturas[0].proveedorId}`}>Pagar las {g.facturas.length}</Link>}</th></tr>
 {g.facturas.map(f=><tr key={f.id}>
 <td data-etiqueta="Razón social / factura"><strong>{f.empresa??'Razón social por identificar'}</strong>{f.rfcReceptor&&<small className="compra-origen">{f.rfcReceptor}</small>}<Link href={`/compras/facturas/${f.id}`}>{f.nombre}</Link>{f.fechaPago&&<small className="compra-origen">Pago: {fechaTexto(f.fechaPago)}</small>}</td>
 <td data-etiqueta="Proveedor y sucursal">{f.proveedor}{f.sucursal&&<small className="compra-origen">{f.sucursal}</small>}{f.proveedorId&&<DatosProveedor id={f.proveedorId}/>}</td>
 <td data-etiqueta="UUID" className="pagos-uuid">{f.uuid??'Sin UUID'}{f.uuidManual&&<small className="compra-origen">Capturado manualmente · XML pendiente</small>}</td>
 <td data-etiqueta="Saldo a pagar"><strong>{pesos(f.saldo)}</strong></td><td data-etiqueta="Tipo de pago previsto">{f.formaPrevista??'Por definir'}</td>
 <td data-etiqueta="Documentos"><div className="acciones">{f.comprobantes?.length?f.comprobantes.map((c,i)=><a key={c.href} className="boton boton-secundario" href={c.href} title={c.nombre} target="_blank" rel="noreferrer">Comprobante · {c.formato}{f.comprobantes!.length>1?` ${i+1}`:''}</a>):<small>Sin comprobante</small>}
 <a className="boton boton-secundario" href={`/compras/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer">PDF Dodo MX</a>
 {f.xml?<a className="boton boton-secundario" href={`/compras/facturas/${f.id}/archivo?tipo=xml`} target="_blank" rel="noreferrer">XML</a>:<small>XML pendiente</small>}
 {edita&&f.proveedorId&&<Link className="boton boton-secundario" href={`/compras/pagos/nuevo?proveedor=${f.proveedorId}&factura=${f.id}`}>Registrar pago</Link>}</div></td>
 </tr>)}</tbody>)}</table></div></>;
}
