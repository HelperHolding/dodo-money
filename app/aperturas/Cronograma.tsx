import Link from 'next/link';
import {Fragment} from 'react';
import {nombreEstado} from '@/lib/aperturas';
import {textoPts,type Avance,type FilaCronograma} from '@/lib/aperturasAkton';

const corta=(d:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`)).replace('.','');
const pct=(n:number|null)=>n===null?'—':`${n} %`;
function Var({a}:{a:Avance}) {
 return <span className="akton-var" data-favorable={a.favorable??undefined}>{a.variacion===null?'—':textoPts(a.variacion)}</span>;
}

// Tabla por etapa: real contra esperado a hoy, fechas y avisos al margen. Cada etapa despliega sus tareas.
export function Cronograma({filas,total,base}:{filas:FilaCronograma[];total:Avance;base:string}) {
 const desde=filas.flatMap(f=>f.desde?[f.desde]:[]).sort()[0],hasta=filas.flatMap(f=>f.hasta?[f.hasta]:[]).sort().at(-1);
 return <section className="akton-tabla-marco" aria-labelledby="ap-cronograma">
  <h2 id="ap-cronograma" className="akton-titulo">Cronograma por etapa</h2>
  <p className="akton-subtitulo">Avance real contra lo esperado a hoy según las fechas de cada tarea. La variación compara el avance «con fecha» (solo las tareas con fecha) contra lo esperado, por eso puede diferir del Avance total. Tolerancia: 5 pts.</p>
  <div className="tabla-contenedor"><table className="akton-tabla tabla-tarjetas ap-crono-tabla ap-tabla">
   <thead><tr><th>Etapa</th><th>Conceptos</th><th>Listos</th><th>Avance</th><th>Con fecha</th><th>Esperado</th><th>Var. vs esperado</th><th>Inicio</th><th>Fin</th><th>Notas</th></tr></thead>
   <tbody>{filas.map(f=><Fragment key={f.clave}>
    <tr>
     <td data-label="Etapa"><details className="ap-crono-etapa"><summary><strong>{f.clave} · {f.nombre}</strong></summary>
      {f.tareas.length===0?<p className="akton-subtitulo">Sin tareas con fecha.</p>:<ul className="ap-crono-tareas">{f.tareas.map(t=><li key={t.item.id}>
       <Link href={`${base}/items/${t.item.id}`}>{t.item.nombre}</Link>
       <small>{corta(t.desde)}{t.desde!==t.hasta?` – ${corta(t.hasta)}`:''} · {nombreEstado(t.item)}{t.item.responsable?` · ${t.item.responsable}`:''}</small>
       {t.item.estado==='bloqueado'&&<span className="akton-no">Bloqueada</span>}
       {t.diasVencida!==null&&<span className="akton-no">Vencida hace {t.diasVencida} {t.diasVencida===1?'día':'días'}</span>}
      </li>)}</ul>}
      {f.sinFecha>0&&<p className="akton-subtitulo">{f.sinFecha} sin fecha · <Link href={`${base}?vista=calendario`}>programar en el Calendario</Link></p>}
     </details></td>
     <td data-label="Conceptos">{f.avance.conceptos}</td>
     <td data-label="Listos">{f.avance.listos}</td>
     <td data-label="Avance">{pct(f.avance.real)}</td>
     <td data-label="Con fecha">{pct(f.avance.realConFecha)}</td>
     <td data-label="Esperado" className="akton-pct">{pct(f.avance.esperado)}</td>
     <td data-label="Var. vs esperado"><Var a={f.avance}/></td>
     <td data-label="Inicio" className="ap-crono-fecha">{f.desde?corta(f.desde):'—'}</td>
     <td data-label="Fin" className="ap-crono-fecha">{f.hasta?corta(f.hasta):'—'}</td>
     <td data-label="Notas" className="akton-nota-celda">{f.notas.map(n=><p key={n} className="akton-nota">{n}</p>)}</td>
    </tr>
   </Fragment>)}
   <tr className="akton-subtotal">
    <td data-label="Etapa">Total del proyecto</td><td data-label="Conceptos">{total.conceptos}</td><td data-label="Listos">{total.listos}</td>
    <td data-label="Avance">{pct(total.real)}</td><td data-label="Con fecha">{pct(total.realConFecha)}</td><td data-label="Esperado">{pct(total.esperado)}</td><td data-label="Var. vs esperado"><Var a={total}/></td>
    <td data-label="Inicio" className="ap-crono-fecha">{desde?corta(desde):'—'}</td><td data-label="Fin" className="ap-crono-fecha">{hasta?corta(hasta):'—'}</td><td data-label="Notas"/>
   </tr>
   </tbody>
  </table></div>
 </section>;
}
