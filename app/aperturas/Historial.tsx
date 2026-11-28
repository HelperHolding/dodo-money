import Link from 'next/link';
import {CATEGORIAS,ESTADOS,esCategoria} from '@/lib/aperturas';
import {pesos,fechaTexto} from '@/lib/formato';
export type CambioApertura={fecha:string;anterior:Record<string,unknown>;nuevo:Record<string,unknown>;perfiles:{nombre:string}|null};
// Solo estos campos se muestran; revision, actualizado_en y lo demás interno quedan fuera.
const CAMPOS:Record<string,string>={nombre:'Nombre',descripcion:'Descripción',estado:'Estado',responsable:'Responsable',inicio:'Inicio previsto',fin:'Fin previsto',cantidad:'Cantidad necesaria',recibido:'Cantidad recibida',precio:'Precio unitario estimado',evidencia:'Evidencia',notas:'Notas',orden_id:'Orden de compra',factura_id:'Factura',categoria:'Categoría',objetivo_desde:'Objetivo desde',objetivo_hasta:'Objetivo hasta',presupuesto:'Presupuesto'};
function valor(k:string,v:unknown){
 if(v===null||v===undefined||v==='')return '—';
 if(k==='estado')return ESTADOS[String(v)]??String(v);
 if(k==='categoria')return esCategoria(v)?CATEGORIAS[v].nombre:String(v);
 if(['precio','presupuesto'].includes(k))return pesos(Number(v));
 if(['inicio','fin','objetivo_desde','objetivo_hasta'].includes(k))return fechaTexto(String(v));
 if(k==='orden_id')return <Link href={`/compras/ordenes/${v}`}>Ver orden</Link>;
 if(k==='factura_id')return <Link href={`/compras/facturas/${v}`}>Ver factura</Link>;
 return typeof v==='object'?JSON.stringify(v):String(v);
}
// Historial en tabla Akton: Fecha · Quién · Qué cambió («Campo: antes → después»).
export function Historial({cambios}:{cambios:CambioApertura[]}){
 return <div className="akton"><section className="akton-tabla-marco" aria-labelledby="ap-historial">
  <h2 id="ap-historial" className="akton-titulo">Historial de cambios</h2>
  {!cambios.length?<p className="akton-subtitulo">Sin cambios registrados.</p>:
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla">
   <thead><tr><th>Fecha</th><th>Quién</th><th>Qué cambió</th></tr></thead>
   <tbody>{cambios.map((h,n)=>{const campos=Object.entries(CAMPOS).filter(([k])=>String(h.anterior?.[k]??'')!==String(h.nuevo?.[k]??''));return <tr key={`${h.fecha}-${n}`}>
    <td data-label="Fecha" className="ap-crono-fecha">{new Date(h.fecha).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})}</td>
    <td data-label="Quién">{h.perfiles?.nombre??'Administración'}</td>
    <td data-label="Qué cambió">{campos.length?<ul className="ap-cambios">{campos.map(([k,label])=><li key={k}><b>{label}:</b> <span className="texto-libre">{valor(k,h.anterior?.[k])}</span> → <span className="texto-libre">{valor(k,h.nuevo?.[k])}</span></li>)}</ul>:'Sin cambios en campos visibles'}</td>
   </tr>;})}</tbody>
  </table></div>}
 </section></div>;
}
