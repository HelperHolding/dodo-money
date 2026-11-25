import Link from 'next/link';
import {Fragment} from 'react';
import {CATEGORIAS,nombreEstado,type ItemApertura} from '@/lib/aperturas';
import {fechaConcepto,notasConcepto,porEtapa,tonoConcepto} from '@/lib/aperturasAkton';
import {fechaTexto} from '@/lib/formato';

// Conceptos en tabla Akton agrupada por etapa. Rojo solo para vencido o bloqueado; verde solo para listo.
export function ListaConceptos({items,base,hoy,titulo,descripcion,fotos,cotizar}:{items:ItemApertura[];base:string;hoy:string;titulo:string;descripcion?:string;fotos?:Record<string,string>;cotizar?:string}) {
 return <section className="akton-tabla-marco" aria-labelledby="ap-lista">
  <h2 id="ap-lista" className="akton-titulo">{titulo} · {items.length}</h2>
  {descripcion&&<p className="akton-subtitulo">{descripcion}</p>}
  {items.length===0?<p className="akton-subtitulo">Sin conceptos con estos filtros.</p>:
  <ConForm cotizar={cotizar}><div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-tabla">
   <thead><tr><th>Concepto</th><th>Estado</th><th>Responsable</th><th>Cantidad / recibido</th><th>Fecha</th><th>Notas</th></tr></thead>
   <tbody>{porEtapa(items).map(g=><Fragment key={g.clave}>
    <tr className="akton-seccion"><th colSpan={6}>{g.clave} · {g.nombre} · {g.items.length}</th></tr>
    {g.items.map(i=>{const tono=tonoConcepto(i,hoy);return <tr key={i.id}>
     <td data-label="Concepto" className={fotos||cotizar?'ap-celda-concepto':undefined}><div className={fotos||cotizar?'ap-concepto-foto':undefined} style={{minWidth:0}}>{fotos&&(fotos[i.id]?<img className="ap-miniatura" src={fotos[i.id]} alt={i.nombre} loading="lazy"/>:<span className="ap-miniatura" aria-hidden="true"/>)}{cotizar&&(i.tipo==='equipo'||i.tipo==='referencia')&&<input type="checkbox" name="items" value={i.id} aria-label={`Incluir ${i.clave}`} style={{flex:'none',width:20,height:20}}/>}<div style={{minWidth:0}}><Link href={`${base}/items/${i.id}`}>{i.nombre}</Link>
      <small className="ap-lista-sub">{i.clave}{i.categoria?` · ${CATEGORIAS[i.categoria]?.nombre??i.categoria}`:''}</small></div></div></td>
     <td data-label="Estado"><span className={tono==='listo'?'akton-si':i.estado==='bloqueado'?'akton-no':undefined}>{nombreEstado(i)}</span></td>
     <td data-label="Responsable">{i.responsable??'Sin asignar'}</td>
     <td data-label="Cantidad / recibido">{i.cantidad??'Por confirmar'} / {i.recibido}{typeof i.original?.unidad==='string'?` ${i.original.unidad}`:''}</td>
     <td data-label="Fecha" className={`ap-crono-fecha${tono==='alerta'&&i.estado!=='bloqueado'?' akton-no':''}`}>{(f=>f?fechaTexto(f):'Sin fecha')(fechaConcepto(i))}</td>
     <td data-label="Notas" className="akton-nota-celda">{notasConcepto(i,hoy).map(n=><p key={n} className="akton-nota">{n}</p>)}</td>
    </tr>;})}
   </Fragment>)}</tbody>
  </table></div></ConForm>}
 </section>;
}

// Con `cotizar` la tabla va en un formulario GET (sin JS) que lleva las partidas marcadas a la solicitud de cotización.
function ConForm({cotizar,children}:{cotizar?:string;children:React.ReactNode}) {
 if(!cotizar)return <>{children}</>;
 const boton=<div className="acciones"><button type="submit" className="boton boton-secundario">Solicitud de cotización</button></div>;
 return <form method="get" action={cotizar}>{boton}{children}{boton}</form>;
}
