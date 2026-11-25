import Link from 'next/link';
import {Fragment} from 'react';
import {CATEGORIAS,ESTADOS,type ItemApertura} from '@/lib/aperturas';
import {notasConcepto,porEtapa,tonoConcepto} from '@/lib/aperturasAkton';
import {fechaTexto} from '@/lib/formato';

// Conceptos en tabla Akton agrupada por etapa. Rojo solo para vencido o bloqueado; verde solo para listo.
export function ListaConceptos({items,base,hoy,titulo,descripcion}:{items:ItemApertura[];base:string;hoy:string;titulo:string;descripcion?:string}) {
 return <section className="akton-tabla-marco" aria-labelledby="ap-lista">
  <h2 id="ap-lista" className="akton-titulo">{titulo} · {items.length}</h2>
  {descripcion&&<p className="akton-subtitulo">{descripcion}</p>}
  {items.length===0?<p className="akton-subtitulo">Sin conceptos con estos filtros.</p>:
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla">
   <thead><tr><th>Concepto</th><th>Estado</th><th>Responsable</th><th>Cantidad / recibido</th><th>Fecha fin</th><th>Notas</th></tr></thead>
   <tbody>{porEtapa(items).map(g=><Fragment key={g.clave}>
    <tr className="akton-seccion"><th colSpan={6}>{g.clave} · {g.nombre} · {g.items.length}</th></tr>
    {g.items.map(i=>{const tono=tonoConcepto(i,hoy);return <tr key={i.id}>
     <td data-label="Concepto"><div style={{minWidth:0}}><Link href={`${base}/items/${i.id}`}>{i.nombre}</Link>
      <small className="ap-lista-sub">{i.clave}{i.categoria?` · ${CATEGORIAS[i.categoria]?.nombre??i.categoria}`:''}</small></div></td>
     <td data-label="Estado"><span className={tono==='listo'?'akton-si':i.estado==='bloqueado'?'akton-no':undefined}>{ESTADOS[i.estado]}</span></td>
     <td data-label="Responsable">{i.responsable??'Sin asignar'}</td>
     <td data-label="Cantidad / recibido">{i.cantidad??'Por confirmar'} / {i.recibido}{typeof i.original?.unidad==='string'?` ${i.original.unidad}`:''}</td>
     <td data-label="Fecha fin" className={`ap-crono-fecha${tono==='alerta'&&i.estado!=='bloqueado'?' akton-no':''}`}>{i.fin?fechaTexto(i.fin):'Sin fecha'}</td>
     <td data-label="Notas" className="akton-nota-celda">{notasConcepto(i,hoy).map(n=><p key={n} className="akton-nota">{n}</p>)}</td>
    </tr>;})}
   </Fragment>)}</tbody>
  </table></div>}
 </section>;
}
