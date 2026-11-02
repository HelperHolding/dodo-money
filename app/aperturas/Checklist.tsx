import Link from 'next/link';
import {ConInfo} from '@/components/ConInfo';
import {checklistApertura,type ItemApertura,type LineaChecklist,type MarcaChecklist} from '@/lib/aperturas';

const MARCAS:Record<MarcaChecklist,{texto:string;icono:string}>={listo:{texto:'Listo',icono:'✓'},curso:{texto:'En curso',icono:'◐'},bloqueado:{texto:'Bloqueado',icono:'!'},pendiente:{texto:'Pendiente',icono:''}};
const VISIBLES=8;

function Linea({l,base}:{l:LineaChecklist;base:string}) {
 const d=l.destino,href='item' in d?`${base}/items/${d.item}`:`${base}?vista=${d.vista}${d.etapa?`&etapa=${d.etapa}`:''}${d.cat?`&cat=${d.cat}`:''}`;
 return <li><Link href={href} className="ap-check-linea"><span className="ap-check-marca" data-marca={l.marca} aria-label={MARCAS[l.marca].texto}>{MARCAS[l.marca].icono}</span><span>{l.nombre}</span>{l.total>1&&<small>{l.listos} de {l.total}</small>}</Link></li>;
}
export function Checklist({items,base}:{items:ItemApertura[];base:string}) {
 const {modulos,general}=checklistApertura(items);
 return <section className="seccion"><div className="ap-check-encabezado"><div className="ap-dona" style={{width:96,height:96,flexBasis:96}}><svg viewBox="0 0 120 120" role="img" aria-label={`Avance general: ${general??0} %`}><circle cx="60" cy="60" r="46" fill="none" style={{stroke:'var(--dato-pista)'}} strokeWidth="14"/>{general?<circle cx="60" cy="60" r="46" fill="none" style={{stroke:'var(--cuadra)'}} strokeWidth="14" pathLength="100" strokeDasharray={`${general} ${100-general}`} transform="rotate(-90 60 60)"/>:null}</svg><div><strong style={{fontSize:'1.3rem'}}>{general===null?'—':`${general} %`}</strong></div></div>
 <div><h2>Checklist de apertura</h2><ConInfo titulo="Checklist de apertura" etiqueta="Cómo leer esto">Cada módulo junta sus etapas. Las actividades van una por línea; las validaciones técnicas y el equipo se resumen por grupo (el equipo, por categoría). Listo es actividad completada o equipo instalado o verificado; no cuentan los que no aplican ni el equipo por validar. El avance general promedia los cuatro módulos, para que las piezas de compras no tapen al resto.</ConInfo>
 <p className="ap-check-leyenda">{(['listo','curso','bloqueado','pendiente'] as const).map(m=><span key={m}><span className="ap-check-marca" data-marca={m} aria-hidden="true">{MARCAS[m].icono}</span>{MARCAS[m].texto}</span>)}</p></div></div>
 <div className="ap-check-modulos">{modulos.map(m=><article key={m.clave} className="ap-check-modulo"><div className="ap-titulo"><h3>{m.nombre}</h3><strong>{m.porcentaje===null?'—':`${m.porcentaje} %`}</strong></div><progress value={m.porcentaje??0} max={100} aria-label={`Avance de ${m.nombre}`}/><small className="ap-nota">{m.listos} de {m.total} listos · {m.etapas.join(', ')}</small>
  {m.lineas.length?<><ul className="ap-check-lista">{m.lineas.slice(0,VISIBLES).map(l=><Linea key={l.clave} l={l} base={base}/>)}</ul>{m.lineas.length>VISIBLES&&<details><summary>Ver {m.lineas.length-VISIBLES} más</summary><ul className="ap-check-lista">{m.lineas.slice(VISIBLES).map(l=><Linea key={l.clave} l={l} base={base}/>)}</ul></details>}</>:<p className="ap-nota">Sin registros aplicables.</p>}
 </article>)}</div></section>;
}
