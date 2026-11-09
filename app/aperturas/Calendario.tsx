"use client";
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useRouter} from 'next/navigation';
import {Icono} from '@/components/Icono';
import {ESTADOS,ETAPAS,CATEGORIAS} from '@/lib/aperturas';
import {barrasSemana,claveGrupo,cubreDia,enCalendario,moverMesTexto,nombreMes,rangoItem,semanasCalendario,textoSobre,type Agrupacion,type Grupo,type ItemCalendario} from '@/lib/aperturasCalendario';
import {fijarFechasApertura,guardarColorApertura} from './accionesCalendario';

const CARRILES=4,DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const fechaCorta=(d:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
const fechaLarga=(d:string)=>new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
const rangoTexto=(i:ItemCalendario)=>{const r=rangoItem(i);return !r?'Sin fecha':r.desde===r.hasta?fechaCorta(r.desde):`${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`;};
const grupoTexto=(i:ItemCalendario)=>`${i.etapa} · ${ETAPAS[i.etapa]}${i.categoria?` · ${CATEGORIAS[i.categoria]?.nombre??i.categoria}`:''}`;

type Abierta = {tipo:'dia';dia:string}|{tipo:'item';item:ItemCalendario}|{tipo:'colores'}|null;

export function Calendario({proyecto,items,grupos,agrupacion,mes,hoy,edita}:{proyecto:string;items:ItemCalendario[];grupos:Grupo[];agrupacion:Agrupacion;mes:string;hoy:string;edita:boolean}) {
 const [abierta,setAbierta]=useState<Abierta>(null);
 const color=useMemo(()=>new Map(grupos.map(g=>[g.clave,g.color])),[grupos]);
 const colorDe=(i:ItemCalendario)=>color.get(claveGrupo(agrupacion,i))??'#94a3b8';
 const visibles=useMemo(()=>items.filter(enCalendario),[items]);
 const semanas=useMemo(()=>semanasCalendario(mes),[mes]);
 const delMes=useMemo(()=>visibles.filter(i=>{const r=rangoItem(i)!;return r.desde<=`${mes}-31`&&r.hasta>=`${mes}-01`;}).sort((a,b)=>rangoItem(a)!.desde.localeCompare(rangoItem(b)!.desde)||a.nombre.localeCompare(b.nombre)),[visibles,mes]);
 const sinFecha=items.filter(i=>i.estado!=='no_aplica'&&!rangoItem(i)).length;
 const enlace=(cambios:Record<string,string>)=>`/aperturas/${proyecto}?${new URLSearchParams({vista:'calendario',mes,color:agrupacion,...cambios})}`;
 const usados=new Set<string>(visibles.map(i=>claveGrupo(agrupacion,i)));

 return <section className="seccion ap-cal">
  <div className="ap-cal-barra">
   <div className="ap-cal-mes">
    <Link className="boton-icono" href={enlace({mes:moverMesTexto(mes,-1)})} aria-label="Mes anterior">‹</Link>
    <h2>{nombreMes(mes)}</h2>
    <Link className="boton-icono" href={enlace({mes:moverMesTexto(mes,1)})} aria-label="Mes siguiente">›</Link>
    {!hoy.startsWith(mes)&&<Link className="boton boton-secundario" href={enlace({mes:hoy.slice(0,7)})}>Hoy</Link>}
   </div>
   <div className="ap-cal-controles">
    <div className="ap-cal-selector" role="group" aria-label="Colorear por">
     <span>Colorear por</span>
     <Link href={enlace({color:'etapa'})} aria-current={agrupacion==='etapa'||undefined}>Etapa</Link>
     <Link href={enlace({color:'categoria'})} aria-current={agrupacion==='categoria'||undefined}>Categoría</Link>
    </div>
    {edita&&<button type="button" className="boton boton-secundario" onClick={()=>setAbierta({tipo:'colores'})}>Colores</button>}
   </div>
  </div>
  <ul className="ap-cal-leyenda" aria-label="Colores">
   {grupos.filter(g=>usados.has(g.clave)).map(g=><li key={g.clave}><span style={{background:g.color}}/>{g.nombre}</li>)}
  </ul>
  {sinFecha>0&&<p className="ap-nota">{sinFecha} {sinFecha===1?'tarea sin fecha':'tareas sin fecha'}.{edita?' Puedes programarlas desde un día del calendario.':''}</p>}

  <div className="ap-cal-rejilla" role="grid" aria-label={`Calendario de ${nombreMes(mes)}`}>
   <div className="ap-cal-dias" role="row">{DIAS.map(d=><span key={d} role="columnheader">{d}</span>)}</div>
   {semanas.map(semana=>{
    const {barras}=barrasSemana(visibles,semana);
    const ocultas=semana.map(c=>barras.filter(b=>b.carril>=CARRILES&&cubreDia(b.item,c.dia)).length);
    const filas=Math.min(CARRILES,Math.max(0,...barras.map(b=>b.carril+1)))+(ocultas.some(Boolean)?1:0);
    return <div key={semana[0].dia} className="ap-cal-semana" role="row" style={{gridTemplateRows:`30px repeat(${filas},22px) 1fr`}}>
     {semana.map((c,col)=><button key={c.dia} type="button" role="gridcell" className="ap-cal-dia" data-fuera={!c.delMes||undefined} data-hoy={c.dia===hoy||undefined}
      style={{gridColumn:col+1,gridRow:'1 / -1'}} onClick={()=>setAbierta({tipo:'dia',dia:c.dia})} aria-label={fechaLarga(c.dia)}>
      <span>{Number(c.dia.slice(8))}</span>
     </button>)}
     {barras.filter(b=>b.carril<CARRILES).map(b=>{const fondo=colorDe(b.item);return <button key={b.item.id} type="button" className="ap-cal-tarea"
      data-antes={b.empiezaAntes||undefined} data-despues={b.sigueDespues||undefined} data-listo={['completado','verificado','instalado'].includes(b.item.estado)||undefined}
      style={{gridColumn:`${b.col+1} / span ${b.span}`,gridRow:b.carril+2,background:fondo,color:textoSobre(fondo)}}
      title={`${b.item.nombre} · ${rangoTexto(b.item)} · ${ESTADOS[b.item.estado]}`} onClick={()=>setAbierta({tipo:'item',item:b.item})}>{b.item.nombre}</button>;})}
     {ocultas.map((n,col)=>n>0&&<button key={col} type="button" className="ap-cal-mas" style={{gridColumn:col+1,gridRow:CARRILES+2}} onClick={()=>setAbierta({tipo:'dia',dia:semana[col].dia})}>+{n} más</button>)}
    </div>;
   })}
  </div>

  {/* En celular: tarjetas del mes en orden, sin deslizar de lado. */}
  <div className="ap-cal-agenda">
   {edita&&<button type="button" className="boton" onClick={()=>setAbierta({tipo:'dia',dia:hoy.startsWith(mes)?hoy:`${mes}-01`})}>Programar tarea</button>}
   {delMes.length===0?<p className="ap-nota">Sin tareas este mes.</p>:<ul>{delMes.map(i=><li key={i.id}><button type="button" style={{borderLeftColor:colorDe(i)}} onClick={()=>setAbierta({tipo:'item',item:i})}>
    <strong>{i.nombre}</strong><small>{rangoTexto(i)} · {ESTADOS[i.estado]}</small><small>{grupoTexto(i)}</small></button></li>)}</ul>}
  </div>

  <Ventana abierta={abierta!==null} alCerrar={()=>setAbierta(null)} titulo={abierta?.tipo==='dia'?fechaLarga(abierta.dia):abierta?.tipo==='item'?abierta.item.nombre:'Colores del calendario'}>
   {abierta?.tipo==='dia'&&<Dia dia={abierta.dia} items={items} colorDe={colorDe} edita={edita} abrir={item=>setAbierta({tipo:'item',item})} listo={()=>setAbierta(null)}/>}
   {abierta?.tipo==='item'&&<Tarea item={abierta.item} proyecto={proyecto} edita={edita} listo={()=>setAbierta(null)}/>}
   {abierta?.tipo==='colores'&&<Colores grupos={grupos} agrupacion={agrupacion} listo={()=>setAbierta(null)}/>}
  </Ventana>
 </section>;
}

function Ventana({abierta,alCerrar,titulo,children}:{abierta:boolean;alCerrar:()=>void;titulo:string;children:ReactNode}) {
 const modal=useRef<HTMLDialogElement>(null),[montado,setMontado]=useState(false);
 useEffect(()=>setMontado(true),[]);
 useEffect(()=>{if(!montado)return;if(abierta&&!modal.current?.open)modal.current?.showModal();if(!abierta&&modal.current?.open)modal.current.close();},[abierta,montado]);
 if(!montado)return null;
 return createPortal(<dialog ref={modal} className="compra-filtros-modal ap-cal-modal" aria-labelledby="ap-cal-titulo" onClose={alCerrar}>
  {abierta&&<><header className="compra-modal-encabezado"><div><h2 id="ap-cal-titulo">{titulo}</h2></div><button type="button" className="boton-icono compra-modal-cerrar" aria-label="Cerrar" onClick={()=>modal.current?.close()}><Icono nombre="cerrar" tamano={22}/></button></header>{children}</>}
 </dialog>,document.body);
}

// Guarda, refresca la página y cierra; el error queda en la ventana.
function useGuardar(listo:()=>void) {
 const router=useRouter(),[ocupado,setOcupado]=useState(false),[error,setError]=useState('');
 const guardar=async(accion:()=>Promise<{error:string}|{ok:true}>)=>{
  setOcupado(true);setError('');
  try{const r=await accion();if('error' in r){setError(r.error);return;}router.refresh();listo();}
  catch{setError('No se pudo guardar. Recarga la página e intenta de nuevo.');}
  finally{setOcupado(false);}
 };
 return {ocupado,error,setError,guardar};
}
const formulario=(datos:Record<string,string>)=>{const fd=new FormData();for(const [k,v] of Object.entries(datos))fd.set(k,v);return fd;};

function Dia({dia,items,colorDe,edita,abrir,listo}:{dia:string;items:ItemCalendario[];colorDe:(i:ItemCalendario)=>string;edita:boolean;abrir:(i:ItemCalendario)=>void;listo:()=>void}) {
 const del=items.filter(i=>enCalendario(i)&&cubreDia(i,dia));
 const [q,setQ]=useState(''),[elegida,setElegida]=useState(''),[fin,setFin]=useState(dia);
 const {ocupado,error,setError,guardar}=useGuardar(listo);
 // Primero las que no tienen fecha; dentro, por etapa y nombre.
 const opciones=useMemo(()=>{const t=q.trim().toLocaleLowerCase();return items.filter(i=>i.estado!=='no_aplica'&&!cubreDia(i,dia)&&(!t||`${i.nombre} ${i.clave} ${i.responsable??''}`.toLocaleLowerCase().includes(t)))
  .sort((a,b)=>Number(!!rangoItem(a))-Number(!!rangoItem(b))||a.etapa.localeCompare(b.etapa)||a.nombre.localeCompare(b.nombre)).slice(0,60);},[items,q,dia]);
 return <>
  <h3 className="ap-cal-sub">Tareas este día · {del.length}</h3>
  {del.length===0?<p className="ap-nota">Nada programado.</p>:<ul className="ap-cal-lista">{del.map(i=><li key={i.id}><button type="button" style={{borderLeftColor:colorDe(i)}} onClick={()=>abrir(i)}><strong>{i.nombre}</strong><small>{rangoTexto(i)} · {ESTADOS[i.estado]}</small></button></li>)}</ul>}
  {edita&&<form className="formulario" onSubmit={e=>{e.preventDefault();if(!elegida){setError('Elige una tarea.');return;}void guardar(()=>fijarFechasApertura(formulario({item_id:elegida,inicio:dia,fin})));}}>
   <h3 className="ap-cal-sub">Programar una tarea desde este día</h3>
   <div className="campo"><label htmlFor="ap-cal-buscar">Buscar tarea</label><input id="ap-cal-buscar" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nombre, clave o responsable" disabled={ocupado}/></div>
   <div className="campo"><label htmlFor="ap-cal-tarea">Tarea</label><select id="ap-cal-tarea" value={elegida} onChange={e=>{setElegida(e.target.value);setError('');}} required disabled={ocupado} size={Math.min(8,Math.max(3,opciones.length))}>
    {opciones.map(i=><option key={i.id} value={i.id}>{rangoItem(i)?'':'● '}{i.etapa} · {i.nombre}{rangoItem(i)?` (${rangoTexto(i)})`:''}</option>)}
   </select><small className="ap-nota">● sin fecha. Elegir una que ya tiene fecha la mueve a este día.</small></div>
   <div className="rejilla"><div className="campo"><label>Inicio</label><input type="date" value={dia} disabled/></div><div className="campo"><label htmlFor="ap-cal-fin">Fin</label><input id="ap-cal-fin" type="date" min={dia} value={fin} onChange={e=>setFin(e.target.value)} required disabled={ocupado}/></div></div>
   {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
   <div className="acciones"><button type="submit" className="boton" disabled={ocupado}>{ocupado?'Guardando…':'Programar'}</button></div>
  </form>}
 </>;
}

function Tarea({item:i,proyecto,edita,listo}:{item:ItemCalendario;proyecto:string;edita:boolean;listo:()=>void}) {
 const r=rangoItem(i),[inicio,setInicio]=useState(r?.desde??''),[fin,setFin]=useState(r?.hasta??'');
 const {ocupado,error,guardar}=useGuardar(listo);
 const enviar=(a:string,b:string)=>guardar(()=>fijarFechasApertura(formulario({item_id:i.id,inicio:a,fin:b})));
 return <>
  <p className="ap-nota">{grupoTexto(i)} · {ESTADOS[i.estado]}{i.responsable?` · ${i.responsable}`:''}</p>
  {edita?<form className="formulario" onSubmit={e=>{e.preventDefault();void enviar(inicio,fin);}}>
   <div className="rejilla"><div className="campo"><label htmlFor="ap-cal-inicio">Inicio</label><input id="ap-cal-inicio" type="date" value={inicio} onChange={e=>{setInicio(e.target.value);if(!fin||e.target.value>fin)setFin(e.target.value);}} required disabled={ocupado}/></div>
   <div className="campo"><label htmlFor="ap-cal-fin2">Fin</label><input id="ap-cal-fin2" type="date" min={inicio} value={fin} onChange={e=>setFin(e.target.value)} required disabled={ocupado}/></div></div>
   {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
   <div className="acciones"><button type="submit" className="boton" disabled={ocupado}>{ocupado?'Guardando…':'Guardar fechas'}</button>
    {r&&<button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>void enviar('','')}>Quitar fechas</button>}
    <Link className="boton boton-secundario" href={`/aperturas/${proyecto}/items/${i.id}`}>Abrir tarea</Link></div>
  </form>:<><p>{rangoTexto(i)}</p><Link href={`/aperturas/${proyecto}/items/${i.id}`}>Abrir tarea</Link></>}
 </>;
}

function Colores({grupos,agrupacion,listo}:{grupos:Grupo[];agrupacion:Agrupacion;listo:()=>void}) {
 const [valores,setValores]=useState(()=>Object.fromEntries(grupos.map(g=>[g.clave,g.color])));
 const {ocupado,error,guardar}=useGuardar(listo);
 const cambios=grupos.filter(g=>valores[g.clave]!==g.color);
 return <form className="formulario" onSubmit={e=>{e.preventDefault();void guardar(async()=>{
  for(const g of cambios){const color=valores[g.clave]===g.predeterminado?'':valores[g.clave];const r=await guardarColorApertura(formulario({agrupacion,clave:g.clave,color}));if('error' in r)return r;}
  return {ok:true};});}}>
  <p className="ap-nota">Colores por {agrupacion==='etapa'?'etapa':'categoría'}. Valen para todas las aperturas.</p>
  <ul className="ap-cal-colores">{grupos.map(g=><li key={g.clave}>
   <input type="color" id={`ap-color-${g.clave}`} value={valores[g.clave]} onChange={e=>setValores(v=>({...v,[g.clave]:e.target.value}))} disabled={ocupado}/>
   <label htmlFor={`ap-color-${g.clave}`}>{g.nombre}</label>
   {valores[g.clave]!==g.predeterminado&&<button type="button" className="boton-texto" disabled={ocupado} onClick={()=>setValores(v=>({...v,[g.clave]:g.predeterminado}))}>Restablecer</button>}
  </li>)}</ul>
  {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
  <div className="acciones"><button type="submit" className="boton" disabled={ocupado||cambios.length===0}>{ocupado?'Guardando…':'Guardar colores'}</button></div>
 </form>;
}
