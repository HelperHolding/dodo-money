import Link from 'next/link';
import {ESTADOS} from '@/lib/aperturas';
import {pesos,fechaTexto} from '@/lib/formato';
export type CambioApertura={fecha:string;anterior:Record<string,unknown>;nuevo:Record<string,unknown>;perfiles:{nombre:string}|null};
const CAMPOS:Record<string,string>={estado:'Estado',responsable:'Responsable',inicio:'Inicio previsto',fin:'Fin previsto',cantidad:'Cantidad necesaria',recibido:'Cantidad recibida',precio:'Precio unitario estimado',evidencia:'Evidencia',notas:'Notas',orden_id:'Orden de compra',factura_id:'Factura',objetivo_desde:'Objetivo desde',objetivo_hasta:'Objetivo hasta',presupuesto:'Presupuesto'};
function valor(k:string,v:unknown){
 if(v===null||v===undefined||v==='')return '—';
 if(k==='estado')return ESTADOS[String(v)]??String(v);
 if(['precio','presupuesto'].includes(k))return pesos(Number(v));
 if(['inicio','fin','objetivo_desde','objetivo_hasta'].includes(k))return fechaTexto(String(v));
 if(k==='orden_id')return <Link href={`/compras/ordenes/${v}`}>Ver orden</Link>;
 if(k==='factura_id')return <Link href={`/compras/facturas/${v}`}>Ver factura</Link>;
 return String(v);
}
export function Historial({cambios}:{cambios:CambioApertura[]}){
 return <section className="seccion"><h2>Historial de cambios</h2>{!cambios.length?<p>Sin cambios registrados.</p>:cambios.map((h,n)=><details key={`${h.fecha}-${n}`}><summary>{new Date(h.fecha).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})} · {h.perfiles?.nombre??'Administración'}</summary><div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>{Object.entries(CAMPOS).filter(([k])=>h.anterior[k]!==h.nuevo[k]).map(([k,label])=><tr key={k}><td>{label}</td><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{valor(k,h.anterior[k])}</td><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{valor(k,h.nuevo[k])}</td></tr>)}</tbody></table></div></details>)}</section>;
}
