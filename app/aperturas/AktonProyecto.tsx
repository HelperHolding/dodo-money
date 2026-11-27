import Link from 'next/link';
import {Kpi} from '@/app/finanzas/PLAkton';
import {fechaTexto,pesos} from '@/lib/formato';
import {textoDiasApertura,type IndicadoresProyecto,type Lectura} from '@/lib/aperturasAkton';

// Franja y lectura del proyecto en el estilo Akton (docs/diseno/estilo-akton.md). Solo dibuja.
const VISTAS=[['checklist','Checklist'],['calendario','Calendario'],['roadmap','Cronograma'],['actividades','Actividades'],['compras','Equipo y compras'],['tecnico','Validaciones técnicas'],['activos','Activos'],['plano','Plano'],['alertas','Atención']] as const;

export function IndicadoresProyectoAkton({k,objetivo}:{k:IndicadoresProyecto;objetivo:string}) {
 const d=k.dias,a=k.avance;
 const dias=textoDiasApertura(d);
 return <section className="akton-kpis" aria-label="Indicadores de la apertura">
  <Kpi etiqueta="Días para la apertura" tono={dias.tono} valor={dias.valor} pie={`Objetivo: ${fechaTexto(objetivo)}`}/>
  <Kpi etiqueta="Avance general" tono={a.favorable??undefined} valor={a.real===null?'—':`${a.real} %`}
   pie={a.esperado===null?'Esperado a hoy: sin fechas':`Con fecha: ${a.realConFecha} % · esperado a hoy: ${a.esperado} %`}/>
  <Kpi etiqueta="Tareas vencidas" tono={k.vencidas?'no':undefined} valor={k.vencidas} pie={`De ${k.aplicables} aplicables`}/>
  <Kpi etiqueta="Bloqueadas" tono={k.bloqueadas?'no':undefined} valor={k.bloqueadas} pie={k.bloqueadas?'Ver en Atención':'Sin bloqueos'}/>
  <Kpi etiqueta="Equipo recibido" valor={k.recepcion===null?'—':`${k.recepcion} %`} pie={`${k.recibidas} de ${k.unidades} unidades`}/>
  <Kpi etiqueta={k.compras.firme?'Compras con precio firme':'Compras estimadas'} tono={k.compras.excede?'no':undefined} valor={pesos(k.compras.monto)}
   pie={k.compras.presupuesto===null?'Presupuesto sin definir':`Presupuesto${k.compras.capex?' CAPEX':''}: ${pesos(k.compras.presupuesto)}`}/>
 </section>;
}

export function LecturaProyecto({lecturas}:{lecturas:Lectura[]}) {
 return <>{lecturas.map((l,n)=><section key={n} className="akton-lectura" aria-labelledby={`ap-lectura-${n+1}`}>
  <span className="akton-lectura-numero" aria-hidden="true">{n+1}</span>
  <div><h2 id={`ap-lectura-${n+1}`}>{l.titulo}</h2><p>{l.texto}</p></div>
 </section>)}</>;
}

export function PestanasProyecto({id,vista}:{id:string;vista:string}) {
 return <nav className="akton-pestanas" aria-label="Vistas del proyecto">{VISTAS.map(([v,t])=>
  <Link key={v} href={`/aperturas/${id}?vista=${v}`} aria-current={vista===v?'page':undefined}>{t}</Link>)}</nav>;
}
