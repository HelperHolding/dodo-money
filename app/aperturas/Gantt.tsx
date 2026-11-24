import Link from 'next/link';
import type {CSSProperties} from 'react';
import {ESTADOS,MARCAS,type ItemApertura,type ProyectoApertura} from '@/lib/aperturas';
import {avanceGeneral,escalaGantt,ganttEtapas,type Escala} from '@/lib/aperturasGantt';
import {fechaTexto} from '@/lib/formato';
import {fuenteGantt} from './fuenteGantt';
import {BotonEnviar} from '@/components/BotonEnviar';
import {crearTarea} from '@/app/tareas/acciones';
import {clave,ESTADOS as ESTADOS_TAREA} from '@/lib/tareas';
import type {Persona} from '@/app/tareas/datos';
import type {PendienteGantt} from './pendientesGantt';

const corta=(d:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
const rango=(a:string,b:string)=>a===b?corta(a):`${corta(a)} – ${corta(b)}`;

// Hoy y la fecha objetivo de apertura, en cada fila para que se vean como una sola línea.
function Guias({escala,hoy,objetivo}:{escala:Escala;hoy:string;objetivo:string}) {
 return <>{escala.marcas.map(m=><span key={m.dia} className="ap-gantt-guia" style={{left:`${m.pos}%`}}/>)}
  {hoy>=escala.desde&&hoy<=escala.hasta&&<span className="ap-gantt-hoy" style={{left:`${escala.pos(hoy)}%`}}/>}
  {objetivo>=escala.desde&&objetivo<=escala.hasta&&<span className="ap-gantt-objetivo" style={{left:`${escala.pos(objetivo)}%`}}/>}</>;
}

// Pendientes de una tarea del Gantt y, para quien puede ligarlos, «Asignar pendiente» con responsable y fecha.
function Pendientes({item,pendientes,personas,volverA}:{item:ItemApertura;pendientes:PendienteGantt[];personas:Persona[];volverA:string}) {
 if(!pendientes.length&&!personas.length)return null;
 return <div className="ap-gantt-pendientes">
  {pendientes.map(t=><Link key={t.numero} className="ap-gantt-pendiente" data-estado={t.estado} href={`/tareas/${t.numero}`} title={`Pendiente ${clave(t.numero)} · ${ESTADOS_TAREA[t.estado]}`}>{clave(t.numero)} · {t.asignado} · {ESTADOS_TAREA[t.estado]}</Link>)}
  {personas.length>0&&item.estado!=='completado'&&item.estado!=='no_aplica'&&<details className="ap-gantt-asignar">
   <summary>Asignar pendiente</summary>
   <form action={crearTarea} className="ap-gantt-asignar-form">
    <input type="hidden" name="titulo" value={item.nombre.slice(0,200)}/><input type="hidden" name="prioridad" value="media"/>
    <input type="hidden" name="documento_tipo" value="apertura_item"/><input type="hidden" name="documento_id" value={item.id}/>
    <input type="hidden" name="volver_a" value={volverA}/><input type="hidden" name="quedarse" value="si"/>
    <label>Responsable<select name="asignado_a" required defaultValue=""><option value="" disabled>Elige una persona</option>{personas.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
    <label>Para el<input type="date" name="vence" defaultValue={item.fin??''}/></label>
    <BotonEnviar>Asignar</BotonEnviar>
   </form>
   <small>Al quedar hechos todos sus pendientes, esta tarea se marca completada.</small>
  </details>}
 </div>;
}

export function Gantt({proyecto:p,items,hoy,colores,pendientes={},personas=[],volverA=''}:{proyecto:ProyectoApertura;items:ItemApertura[];hoy:string;colores:Record<string,string>;pendientes?:Record<string,PendienteGantt[]>;personas?:Persona[];volverA?:string}) {
 const etapas=ganttEtapas(items,hoy),general=avanceGeneral(etapas),base=`/aperturas/${p.id}`;
 const escala=escalaGantt([...etapas.flatMap(e=>[e.desde,e.hasta]),p.objetivo_desde,p.objetivo_hasta,hoy]);
 const conFechas=etapas.some(e=>e.desde);
 return <section className={`ap-panel ap-gantt ${fuenteGantt.className}`}>
  <div className="ap-gantt-cabecera">
   <div><h2>Cronograma (Gantt)</h2><p className="ap-nota">Apertura objetivo: {fechaTexto(p.objetivo_hasta)} · da clic en una etapa para ver sus tareas.</p></div>
   <div className="ap-gantt-general"><span>Avance general</span><strong>{general===null?'—':`${general} %`}</strong><progress value={general??0} max={100} aria-label="Avance general"/></div>
  </div>
  <ul className="ap-gantt-leyenda">
   <li><span className="ap-gantt-ley-hoy"/>Hoy</li><li><span className="ap-gantt-ley-objetivo"/>Apertura objetivo</li>
   <li><span className="ap-gantt-ley-tarea" data-marca="listo"/>{MARCAS.listo.texto}</li><li><span className="ap-gantt-ley-tarea" data-marca="curso"/>{MARCAS.curso.texto}</li>
   <li><span className="ap-gantt-ley-tarea" data-marca="pendiente"/>{MARCAS.pendiente.texto}</li><li><span className="ap-gantt-ley-tarea" data-marca="bloqueado"/>{MARCAS.bloqueado.texto}</li>
  </ul>
  {!conFechas&&<p className="aviso">Ninguna tarea tiene fechas todavía. Prográmalas desde el Calendario para ver las barras.</p>}
  {escala&&<div className="ap-gantt-fila ap-gantt-escala" aria-hidden="true"><div/><div className="ap-gantt-linea">{escala.marcas.map((m,k)=>{const paso=Math.max(1,Math.ceil(escala.marcas.length/8));return k%paso===0&&!(hoy>=escala.desde&&hoy<=escala.hasta&&Math.abs(escala.pos(hoy)-m.pos)<9)&&<span key={m.dia} data-impar={(k/paso)%2===1||undefined} style={{left:`${m.pos}%`}}>{m.etiqueta}</span>;})}
   {hoy>=escala.desde&&hoy<=escala.hasta&&<b className="ap-gantt-hoy-etiqueta" style={{left:`${escala.pos(hoy)}%`}}>Hoy</b>}</div></div>}
  {etapas.map((e,n)=>{
   const color=colores[e.clave]??'#64748b',estilo={'--ap-c':color} as CSSProperties;
   const ancho=escala&&e.desde&&e.hasta?escala.ancho(e.desde,e.hasta):0,adentro=ancho>=14;
   return <details key={e.clave} className="ap-gantt-etapa" style={estilo}>
    <summary className="ap-gantt-fila">
     <div className="ap-gantt-nombre">
      <span className="ap-gantt-num">{n+1}</span>
      <div><strong>{e.nombre}</strong>
       <small>{e.conceptos?`${e.listos} de ${e.conceptos} listos`:'Sin conceptos'}{e.desde&&e.hasta?` · ${rango(e.desde,e.hasta)}`:''}</small>
       {(e.bloqueados>0||e.vencidos>0)&&<span className="ap-gantt-avisos">{e.bloqueados>0&&<em data-tono="rojo">{e.bloqueados} {e.bloqueados===1?'bloqueado':'bloqueados'}</em>}{e.vencidos>0&&<em data-tono="ambar">{e.vencidos} {e.vencidos===1?'vencido':'vencidos'}</em>}</span>}
      </div>
      <b className="ap-gantt-pct">{e.porcentaje===null?'—':`${e.porcentaje} %`}</b>
     </div>
     <div className="ap-gantt-linea">
      {escala&&<Guias escala={escala} hoy={hoy} objetivo={p.objetivo_hasta}/>}
      {escala&&e.desde&&e.hasta?<span className="ap-gantt-barra" style={{left:`${escala.pos(e.desde)}%`,width:`${ancho}%`}} title={`${e.nombre}: ${e.porcentaje??0} % · ${rango(e.desde,e.hasta)}`}>
       <i style={{width:`${e.porcentaje??0}%`}}/>{adentro&&<span>{e.porcentaje??0} %</span>}
      </span>:<span className="ap-gantt-sin">Sin fechas</span>}
      {escala&&e.desde&&!adentro&&<span className="ap-gantt-fuera" style={{left:`calc(${escala.pos(e.desde)+ancho}% + 6px)`}}>{e.porcentaje??0} %</span>}
     </div>
    </summary>
    <div className="ap-gantt-tareas">
     {e.tareas.map(t=><div key={t.item.id} className="ap-gantt-fila ap-gantt-tarea">
      <div className="ap-gantt-nombre"><span className="ap-gantt-marca" data-marca={t.marca}>{MARCAS[t.marca].icono}</span>
       <div><Link href={`${base}/items/${t.item.id}`}>{t.item.nombre}</Link><small>{rango(t.desde,t.hasta)} · {ESTADOS[t.item.estado]}{t.item.responsable?` · ${t.item.responsable}`:''}{t.vencida?' · vencida':''}</small>
       <Pendientes item={t.item} pendientes={pendientes[t.item.id]??[]} personas={personas} volverA={volverA}/></div></div>
      <div className="ap-gantt-linea">{escala&&<><Guias escala={escala} hoy={hoy} objetivo={p.objetivo_hasta}/>
       <Link className="ap-gantt-tbarra" data-marca={t.marca} data-vencida={t.vencida||undefined} href={`${base}/items/${t.item.id}`} aria-label={`${t.item.nombre}, ${rango(t.desde,t.hasta)}`}
        style={{left:`${escala.pos(t.desde)}%`,width:`${escala.ancho(t.desde,t.hasta)}%`}}>{t.marca==='listo'?'✓':''}</Link></>}</div>
     </div>)}
     {e.sinFecha>0&&<p className="ap-nota">{e.sinFecha} {e.sinFecha===1?'concepto sin fecha':'conceptos sin fecha'} · <Link href={`${base}?vista=calendario&color=etapa`}>programar en el Calendario</Link></p>}
     {e.conceptos===0&&<p className="ap-nota">Esta etapa no tiene conceptos.</p>}
    </div>
   </details>;
  })}
 </section>;
}
