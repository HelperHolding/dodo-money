"use client";
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useRouter} from 'next/navigation';
import {Icono} from '@/components/Icono';
import {nombreEstado,ETAPAS,CATEGORIAS} from '@/lib/aperturas';
import {MOMENTOS,barrasSemana,clavePersona,conteoDia,cubreDia,diaPorPersona,enCalendario,esActividad,moverDias,moverMesTexto,nombreMes,personasDe,rangoItem,semanaDe,semanasCalendario,tituloSemana,type Celda,type ItemCalendario,type ModoCalendario,type Persona} from '@/lib/aperturasCalendario';
import {tonoConcepto,type TonoConcepto} from '@/lib/aperturasAkton';
import {fijarFechasApertura} from './accionesCalendario';

const CARRILES=4,CHIPS=4,DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const fechaCorta=(d:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
const fechaLarga=(d:string)=>new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
const rangoTexto=(i:ItemCalendario)=>{const r=rangoItem(i);return !r?'Sin fecha':r.desde===r.hasta?fechaCorta(r.desde):`${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`;};
const grupoTexto=(i:ItemCalendario)=>`${i.etapa} · ${ETAPAS[i.etapa]}${i.categoria?` · ${CATEGORIAS[i.categoria]?.nombre??i.categoria}`:''}`;
type Abierta = {tipo:'dia';dia:string}|{tipo:'item';item:ItemCalendario}|null;
type Props = {proyecto:string;items:ItemCalendario[];modo:ModoCalendario;mes:string;semana:string;persona:string;todos:boolean;hoy:string;edita:boolean};

// Calendario de la apertura: cuadros del mes con quién tiene qué, semana en barras sin amontonarse y barras del mes.
// Filtra por responsable y, de entrada, muestra solo actividades (sin equipo ni validaciones).
// Estilo Akton: gris; verde solo para lo listo y rojo para lo vencido o bloqueado. Las personas van por iniciales.
export function Calendario({proyecto,items,modo,mes,semana,persona,todos,hoy,edita}:Props) {
 const router=useRouter();
 const [abierta,setAbierta]=useState<Abierta>(null);
 // Personas de todo el proyecto: así las iniciales no cambian al filtrar.
 const personas=useMemo(()=>personasDe(items.filter(enCalendario)),[items]);
 const porClave=useMemo(()=>new Map(personas.map(p=>[p.clave,p])),[personas]);
 const personaDe=(i:ItemCalendario)=>porClave.get(clavePersona(i.responsable));
 const tono=(i:ItemCalendario):TonoConcepto=>tonoConcepto(i,hoy);
 const delTipo=useMemo(()=>items.filter(i=>todos||esActividad(i)),[items,todos]);
 const filtrados=useMemo(()=>delTipo.filter(i=>!persona||clavePersona(i.responsable)===persona),[delTipo,persona]);
 const visibles=useMemo(()=>filtrados.filter(enCalendario),[filtrados]);
 const conTareas=useMemo(()=>{const c=new Set(delTipo.filter(enCalendario).map(i=>clavePersona(i.responsable)));return personas.filter(p=>c.has(p.clave));},[delTipo,personas]);
 const semanas=useMemo(()=>semanasCalendario(mes),[mes]);
 const dias7=useMemo(()=>semanaDe(semana),[semana]);
 const periodo=modo==='semana'?{desde:dias7[0].dia,hasta:dias7[6].dia}:{desde:`${mes}-01`,hasta:`${mes}-31`};
 const delPeriodo=useMemo(()=>visibles.filter(i=>{const r=rangoItem(i)!;return r.desde<=periodo.hasta&&r.hasta>=periodo.desde;}).sort((a,b)=>rangoItem(a)!.desde.localeCompare(rangoItem(b)!.desde)||a.nombre.localeCompare(b.nombre)),[visibles,periodo.desde,periodo.hasta]);
 const sinFecha=filtrados.filter(i=>i.estado!=='no_aplica'&&!rangoItem(i)).length;
 const enlace=(cambios:Record<string,string>)=>{
  const q=new URLSearchParams({vista:'calendario',modo,mes,semana,resp:persona,tipos:todos?'todos':'',...cambios});
  for(const [k,v] of [...q.entries()])if(!v)q.delete(k);
  return `/aperturas/${proyecto}?${q}`;
 };
 const irSemana=(lunes:string)=>enlace({semana:lunes,mes:moverDias(lunes,3).slice(0,7)});
 const irMes=(m:string)=>enlace({mes:m,semana:semanaDe(m===hoy.slice(0,7)?hoy:`${m}-01`)[0].dia});
 const etiqueta=(i:ItemCalendario)=>{const p=personaDe(i);return p&&p.clave!=='sin'?`${p.iniciales} · ${i.nombre}`:i.nombre;};
 const leyendaPersonas=persona?conTareas.filter(p=>p.clave===persona):conTareas;
 const estaSemana=semanaDe(hoy)[0].dia;

 return <section className="seccion ap-cal">
  <div className="ap-cal-barra">
   {modo==='semana'?<div className="ap-cal-mes">
    <Link className="boton-icono" href={irSemana(moverDias(semana,-7))} aria-label="Semana anterior">‹</Link>
    <h2>{tituloSemana(dias7)}</h2>
    <Link className="boton-icono" href={irSemana(moverDias(semana,7))} aria-label="Semana siguiente">›</Link>
    {semana!==estaSemana&&<Link className="boton boton-secundario" href={irSemana(estaSemana)}>Hoy</Link>}
   </div>:<div className="ap-cal-mes">
    <Link className="boton-icono" href={irMes(moverMesTexto(mes,-1))} aria-label="Mes anterior">‹</Link>
    <h2>{nombreMes(mes)}</h2>
    <Link className="boton-icono" href={irMes(moverMesTexto(mes,1))} aria-label="Mes siguiente">›</Link>
    {!hoy.startsWith(mes)&&<Link className="boton boton-secundario" href={irMes(hoy.slice(0,7))}>Hoy</Link>}
   </div>}
   <div className="ap-cal-selector" role="group" aria-label="Vista">
    <Link href={enlace({modo:'cuadros'})} aria-current={modo==='cuadros'||undefined}>Cuadros</Link>
    <Link href={enlace({modo:'semana'})} aria-current={modo==='semana'||undefined}>Semana</Link>
    <Link href={enlace({modo:'barras'})} aria-current={modo==='barras'||undefined}>Barras del mes</Link>
   </div>
  </div>
  <div className="ap-cal-controles ap-cal-filtros">
   <label className="ap-cal-campo">Responsable
    <select value={persona} onChange={e=>router.push(enlace({resp:e.target.value}))}>
     <option value="">Todos</option>
     {persona&&!conTareas.some(p=>p.clave===persona)&&<option value={persona}>{porClave.get(persona)?.nombre??'Sin tareas'}</option>}
     {conTareas.map(p=><option key={p.clave} value={p.clave}>{p.nombre}</option>)}
    </select>
   </label>
   <label className="ap-cal-casilla"><input type="checkbox" checked={!todos} onChange={e=>router.push(enlace({tipos:e.target.checked?'':'todos'}))}/>Solo actividades</label>
  </div>
  <ul className="ap-cal-leyenda" aria-label="Cómo leer el calendario">
   <li><span className="ap-cal-muestra" data-tono="listo"/>Listo</li>
   <li><span className="ap-cal-muestra" data-tono="alerta"/>Vencido o bloqueado</li>
   <li><span className="ap-cal-muestra" data-tono="normal"/>Pendiente o en curso</li>
   {leyendaPersonas.map(p=><li key={p.clave}><span className="ap-cal-chip">{p.iniciales}</span>{p.nombre}</li>)}
  </ul>
  {sinFecha>0&&<p className="ap-nota">{sinFecha} {sinFecha===1?'tarea sin fecha':'tareas sin fecha'}{persona?` de ${porClave.get(persona)?.nombre??'esta persona'}`:''}.{edita?' Puedes programarlas desde un día del calendario.':''}</p>}

  {modo==='cuadros'?<Cuadros semanas={semanas} hoy={hoy} items={visibles} personas={personas} abrirDia={dia=>setAbierta({tipo:'dia',dia})}/>
  :<div className="ap-cal-rejilla" role="grid" aria-label={modo==='semana'?`Semana ${tituloSemana(dias7)}`:`Calendario de ${nombreMes(mes)}`}>
   <div className="ap-cal-dias" role="row">{(modo==='semana'?dias7.map((c,k)=>`${DIAS[k]} ${Number(c.dia.slice(8))}`):DIAS).map(d=><span key={d} role="columnheader">{d}</span>)}</div>
   {(modo==='semana'?[dias7.map(c=>({...c,delMes:true}))]:semanas).map(sem=><Semana key={sem[0].dia} semana={sem} items={visibles} hoy={hoy} limite={modo==='semana'?Infinity:CARRILES}
    tono={tono} etiqueta={etiqueta} abrirDia={dia=>setAbierta({tipo:'dia',dia})} abrirItem={item=>setAbierta({tipo:'item',item})}/>)}
  </div>}

  {/* En celular (semana y barras): tarjetas del periodo en orden, sin deslizar de lado. */}
  {modo!=='cuadros'&&<div className="ap-cal-agenda">
   {edita&&<button type="button" className="boton" onClick={()=>setAbierta({tipo:'dia',dia:hoy>=periodo.desde&&hoy<=periodo.hasta?hoy:periodo.desde})}>Programar tarea</button>}
   {delPeriodo.length===0?<p className="ap-nota">Sin tareas {modo==='semana'?'esta semana':'este mes'}.</p>:<ul>{delPeriodo.map(i=><li key={i.id}><button type="button" data-tono={tono(i)} onClick={()=>setAbierta({tipo:'item',item:i})}>
    <strong>{i.nombre}</strong><small>{rangoTexto(i)} · {nombreEstado(i)} · {personaDe(i)?.nombre??'Sin asignar'}</small><small>{grupoTexto(i)}</small></button></li>)}</ul>}
  </div>}

  <Ventana grande={abierta?.tipo==='dia'} abierta={abierta!==null} alCerrar={()=>setAbierta(null)} titulo={abierta?.tipo==='dia'?fechaLarga(abierta.dia):abierta?.tipo==='item'?abierta.item.nombre:''}>
   {abierta?.tipo==='dia'&&<Dia dia={abierta.dia} items={items} visibles={visibles} personas={personas} proyecto={proyecto} tono={tono} edita={edita} abrir={item=>setAbierta({tipo:'item',item})} listo={()=>setAbierta(null)}/>}
   {abierta?.tipo==='item'&&<Tarea item={abierta.item} persona={personaDe(abierta.item)} proyecto={proyecto} edita={edita} listo={()=>setAbierta(null)}/>}
  </Ventana>
 </section>;
}

// Un cuadro por día: iniciales de cada responsable y cuántas tareas tiene ese día.
function Cuadros({semanas,hoy,items,personas,abrirDia}:{semanas:Celda[][];hoy:string;items:ItemCalendario[];personas:Persona[];abrirDia:(dia:string)=>void}) {
 return <div className="ap-cuadros" role="grid" aria-label="Tareas por día y responsable">
  {DIAS.map(d=><span key={d} className="ap-cuadros-dia-semana" role="columnheader">{d}</span>)}
  {semanas.flat().map(c=>{
   // Primero quien tiene más tareas ese día, para que se vea aunque no quepan todas.
   const conteo=conteoDia(items,c.dia,personas).sort((a,b)=>b.n-a.n),total=conteo.reduce((s,x)=>s+x.n,0);
   const texto=total?conteo.map(x=>`${x.persona.nombre} ${x.n}`).join(', '):'sin tareas';
   return <button key={c.dia} type="button" role="gridcell" className="ap-cuadro" data-fuera={!c.delMes||undefined} data-hoy={c.dia===hoy||undefined} data-vacio={!total||undefined}
    aria-label={`${fechaLarga(c.dia)}: ${texto}`} onClick={()=>abrirDia(c.dia)}>
    <span className="ap-cuadro-numero">{Number(c.dia.slice(8))}</span>
    {total>0&&<span className="ap-cuadro-chips">
     {conteo.slice(0,CHIPS).map(x=><span key={x.persona.clave} className="ap-cal-chip" title={`${x.persona.nombre}: ${x.n}`}>{x.persona.iniciales}<b>{x.n}</b></span>)}
     {conteo.length>CHIPS&&<span className="ap-cuadro-mas">+{conteo.length-CHIPS}</span>}
    </span>}
    {total>0&&<span className="ap-cuadro-total">{total} {total===1?'tarea':'tareas'}</span>}
   </button>;
  })}
 </div>;
}

// Una semana de barras; en la vista Semana no hay límite de renglones.
function Semana({semana,items,hoy,limite,tono,etiqueta,abrirDia,abrirItem}:{semana:Celda[];items:ItemCalendario[];hoy:string;limite:number;tono:(i:ItemCalendario)=>TonoConcepto;etiqueta:(i:ItemCalendario)=>string;abrirDia:(d:string)=>void;abrirItem:(i:ItemCalendario)=>void}) {
 const {barras}=barrasSemana(items,semana);
 const ocultas=semana.map(c=>barras.filter(b=>b.carril>=limite&&cubreDia(b.item,c.dia)).length);
 const filas=Math.min(limite,Math.max(0,...barras.map(b=>b.carril+1)))+(ocultas.some(Boolean)?1:0);
 return <div className="ap-cal-semana" data-larga={limite===Infinity||undefined} role="row" style={{gridTemplateRows:`30px repeat(${filas},22px) 1fr`}}>
  {semana.map((c,col)=><button key={c.dia} type="button" role="gridcell" className="ap-cal-dia" data-fuera={!c.delMes||undefined} data-hoy={c.dia===hoy||undefined}
   style={{gridColumn:col+1,gridRow:'1 / -1'}} onClick={()=>abrirDia(c.dia)} aria-label={fechaLarga(c.dia)}>
   <span>{Number(c.dia.slice(8))}</span>
  </button>)}
  {barras.filter(b=>b.carril<limite).map(b=>{return <button key={b.item.id} type="button" className="ap-cal-tarea"
   data-antes={b.empiezaAntes||undefined} data-despues={b.sigueDespues||undefined} data-tono={tono(b.item)}
   style={{gridColumn:`${b.col+1} / span ${b.span}`,gridRow:b.carril+2}}
   title={`${b.item.nombre} · ${rangoTexto(b.item)} · ${nombreEstado(b.item)}${b.item.responsable?` · ${b.item.responsable}`:''}`} onClick={()=>abrirItem(b.item)}>{etiqueta(b.item)}</button>;})}
  {ocultas.map((n,col)=>n>0&&<button key={col} type="button" className="ap-cal-mas" style={{gridColumn:col+1,gridRow:limite+2}} onClick={()=>abrirDia(semana[col].dia)}>+{n} más</button>)}
 </div>;
}

function Ventana({abierta,alCerrar,titulo,grande,children}:{abierta:boolean;alCerrar:()=>void;titulo:string;grande?:boolean;children:ReactNode}) {
 const modal=useRef<HTMLDialogElement>(null),[montado,setMontado]=useState(false);
 useEffect(()=>setMontado(true),[]);
 useEffect(()=>{if(!montado)return;if(abierta&&!modal.current?.open)modal.current?.showModal();if(!abierta&&modal.current?.open)modal.current.close();},[abierta,montado]);
 if(!montado)return null;
 return createPortal(<dialog ref={modal} className="compra-filtros-modal ap-cal-modal" data-grande={grande||undefined} aria-labelledby="ap-cal-titulo" onClose={alCerrar}>
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

// El día en grande: tarjetas agrupadas por responsable, con estado, si empieza, continúa o termina, y liga a la actividad.
function Dia({dia,items,visibles,personas,proyecto,tono,edita,abrir,listo}:{dia:string;items:ItemCalendario[];visibles:ItemCalendario[];personas:Persona[];proyecto:string;tono:(i:ItemCalendario)=>TonoConcepto;edita:boolean;abrir:(i:ItemCalendario)=>void;listo:()=>void}) {
 const grupos=diaPorPersona(visibles,dia,personas),total=grupos.reduce((s,g)=>s+g.tareas.length,0);
 const [q,setQ]=useState(''),[elegida,setElegida]=useState(''),[fin,setFin]=useState(dia);
 const {ocupado,error,setError,guardar}=useGuardar(listo);
 // Primero las que no tienen fecha; dentro, por etapa y nombre.
 const opciones=useMemo(()=>{const t=q.trim().toLocaleLowerCase();return items.filter(i=>i.estado!=='no_aplica'&&!cubreDia(i,dia)&&(!t||`${i.nombre} ${i.clave} ${i.responsable??''}`.toLocaleLowerCase().includes(t)))
  .sort((a,b)=>Number(!!rangoItem(a))-Number(!!rangoItem(b))||a.etapa.localeCompare(b.etapa)||a.nombre.localeCompare(b.nombre)).slice(0,60);},[items,q,dia]);
 return <>
  <p className="ap-nota">{total===0?'Nada programado este día con los filtros actuales.':`${total} ${total===1?'tarea':'tareas'} · ${grupos.length} ${grupos.length===1?'responsable':'responsables'}`}</p>
  <div className="ap-dia-grupos">{grupos.map(g=><section key={g.persona.clave} className="ap-dia-grupo">
   <h3 className="ap-cal-sub"><span className="ap-cal-chip">{g.persona.iniciales}</span>{g.persona.nombre} · {g.tareas.length}</h3>
   <ul className="ap-dia-tarjetas">{g.tareas.map(({item:i,momento})=><li key={i.id} className="ap-dia-tarjeta" data-tono={tono(i)}>
    <Link href={`/aperturas/${proyecto}/items/${i.id}`} className="ap-dia-nombre">{i.nombre}</Link>
    <div className="ap-dia-datos">
     <span className="ap-estado" data-tono={tono(i)}>{nombreEstado(i)}</span>
     <span className="ap-momento" data-momento={momento}>{MOMENTOS[momento]}</span>
     <small>{rangoTexto(i)}</small>
    </div>
    {i.responsable&&i.responsable!==g.persona.nombre&&<small className="ap-nota">Responsable: {i.responsable}</small>}
    <div className="ap-dia-acciones"><Link href={`/aperturas/${proyecto}/items/${i.id}`}>Abrir actividad</Link>{edita&&<button type="button" className="boton-texto" onClick={()=>abrir(i)}>Cambiar fechas</button>}</div>
   </li>)}</ul>
  </section>)}</div>
  {edita&&<details className="ap-dia-programar"><summary>Programar una tarea desde este día</summary><form className="formulario" onSubmit={e=>{e.preventDefault();if(!elegida){setError('Elige una tarea.');return;}void guardar(()=>fijarFechasApertura(formulario({item_id:elegida,inicio:dia,fin})));}}>
   <div className="campo"><label htmlFor="ap-cal-buscar">Buscar tarea</label><input id="ap-cal-buscar" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nombre, clave o responsable" disabled={ocupado}/></div>
   <div className="campo"><label htmlFor="ap-cal-tarea">Tarea</label><select id="ap-cal-tarea" value={elegida} onChange={e=>{setElegida(e.target.value);setError('');}} required disabled={ocupado} size={Math.min(8,Math.max(3,opciones.length))}>
    {opciones.map(i=><option key={i.id} value={i.id}>{rangoItem(i)?'':'● '}{i.etapa} · {i.nombre}{rangoItem(i)?` (${rangoTexto(i)})`:''}</option>)}
   </select><small className="ap-nota">● sin fecha. Elegir una que ya tiene fecha la mueve a este día.</small></div>
   <div className="rejilla"><div className="campo"><label>Inicio</label><input type="date" value={dia} disabled/></div><div className="campo"><label htmlFor="ap-cal-fin">Fin</label><input id="ap-cal-fin" type="date" min={dia} value={fin} onChange={e=>setFin(e.target.value)} required disabled={ocupado}/></div></div>
   {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
   <div className="acciones"><button type="submit" className="boton" disabled={ocupado}>{ocupado?'Guardando…':'Programar'}</button></div>
  </form></details>}
 </>;
}

function Tarea({item:i,persona,proyecto,edita,listo}:{item:ItemCalendario;persona?:Persona;proyecto:string;edita:boolean;listo:()=>void}) {
 const r=rangoItem(i),[inicio,setInicio]=useState(r?.desde??''),[fin,setFin]=useState(r?.hasta??'');
 const {ocupado,error,guardar}=useGuardar(listo);
 const enviar=(a:string,b:string)=>guardar(()=>fijarFechasApertura(formulario({item_id:i.id,inicio:a,fin:b})));
 return <>
  <p className="ap-nota">{grupoTexto(i)} · {nombreEstado(i)} · {i.responsable??persona?.nombre??'Sin asignar'}</p>
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
