"use client";
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useRouter} from 'next/navigation';
import {Icono} from '@/components/Icono';
import {nombreEstado,ETAPAS,CATEGORIAS} from '@/lib/aperturas';
import {SIN_ASIGNAR,MOMENTOS,clavePersona,conteoPorPersona,cubreDia,diaPorPersona,enCalendario,esActividad,filtrarOcultos,leerOcultos,moverDias,moverMesTexto,personasDe,rangoItem,semanaDe,tituloPeriodo,type ItemCalendario,type ModoCalendario,type Persona} from '@/lib/aperturasCalendario';
import {tonoConcepto,type TonoConcepto} from '@/lib/aperturasAkton';
import {fijarFechasApertura} from './accionesCalendario';
import {PanelCalendario} from './PanelCalendario';
import {VistaMes} from './VistaMes';
import {VistaSemana} from './VistaSemana';
import {TarjetaDia} from './TarjetaDia';

const fechaCorta=(d:string)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
const fechaLarga=(d:string)=>new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
const rangoTexto=(i:ItemCalendario)=>{const r=rangoItem(i);return !r?'Sin fecha':r.desde===r.hasta?fechaCorta(r.desde):`${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`;};
const grupoTexto=(i:ItemCalendario)=>`${i.etapa} · ${ETAPAS[i.etapa]}${i.categoria?` · ${CATEGORIAS[i.categoria]?.nombre??i.categoria}`:''}`;
type Abierta = {tipo:'dia';dia:string}|{tipo:'item';item:ItemCalendario}|null;
type Props = {proyecto:string;items:ItemCalendario[];modo:ModoCalendario;mes:string;semana:string;persona:string;todos:boolean;hoy:string;edita:boolean};

// Calendario de la apertura estilo Google Calendar: panel (programar, mini mes, responsables con su color, qué mostrar),
// barra (☰, Hoy, ‹ ›, Mes/Semana) y la vista. Color por responsable; el estado va encima (listo tachado, alerta con «!»).
export function Calendario({proyecto,items,modo,mes,semana,persona,todos,hoy,edita}:Props) {
 const [abierta,setAbierta]=useState<Abierta>(null);
 const [mas,setMas]=useState<{dia:string;ancla:DOMRect}|null>(null);
 const [panel,setPanel]=useState(true),[cajon,setCajon]=useState(false);
 const personas=useMemo(()=>personasDe(items.filter(enCalendario)),[items]);
 const claves=useMemo(()=>personas.map(p=>p.clave),[personas]);
 const porClave=useMemo(()=>new Map(personas.map(p=>[p.clave,p])),[personas]);
 const personaDe=(i:ItemCalendario)=>porClave.get(clavePersona(i.responsable));
 const [ocultos,setOcultos]=useState<Set<string>>(()=>new Set());
 // Ocultos guardados por proyecto en este navegador; con ?resp= de un enlace viejo, solo esa persona.
 // Se aplica una sola vez: al guardar algo la página se refresca y no debe volver a ocultar a quien ya marcaste.
 const respAplicado=useRef(false),llaveClaves=claves.join('|');
 useEffect(()=>{
  try{setPanel(localStorage.getItem('calPanel')!=='plegado');}catch{/* sin almacenamiento */}
  const lista=llaveClaves?llaveClaves.split('|'):[];
  if(!respAplicado.current&&persona&&lista.includes(persona)){respAplicado.current=true;setOcultos(new Set(lista.filter(c=>c!==persona)));return;}
  if(respAplicado.current)return;
  try{setOcultos(leerOcultos(localStorage.getItem(`calOcultos:${proyecto}`),lista));}catch{/* sin almacenamiento */}
 },[proyecto,persona,llaveClaves]);
 // El cajón del panel (celular) se cierra con Esc.
 useEffect(()=>{
  if(!cajon)return;
  const tecla=(e:KeyboardEvent)=>{if(e.key==='Escape')setCajon(false);};
  window.addEventListener('keydown',tecla);return ()=>window.removeEventListener('keydown',tecla);
 },[cajon]);
 const alternar=(clave:string)=>setOcultos(prev=>{
  const n=new Set(prev);if(n.has(clave))n.delete(clave);else n.add(clave);
  try{localStorage.setItem(`calOcultos:${proyecto}`,JSON.stringify([...n]));}catch{/* solo esta visita */}
  return n;
 });
 const alternarPanel=()=>{
  if(window.matchMedia('(max-width: 700px)').matches){setCajon(c=>!c);return;}
  setPanel(p=>{try{localStorage.setItem('calPanel',p?'plegado':'abierto');}catch{/* solo esta visita */}return !p;});
 };
 const tono=(i:ItemCalendario):TonoConcepto=>tonoConcepto(i,hoy);
 const colorDe=(i:ItemCalendario)=>personaDe(i)?.color??SIN_ASIGNAR.color;
 const delTipo=useMemo(()=>items.filter(i=>todos||esActividad(i)),[items,todos]);
 const visibles=useMemo(()=>filtrarOcultos(delTipo.filter(enCalendario),ocultos),[delTipo,ocultos]);
 const dias7=semanaDe(semana);
 const periodo=modo==='semana'?{desde:dias7[0].dia,hasta:dias7[6].dia}:{desde:`${mes}-01`,hasta:`${mes}-31`};
 const conteo=useMemo(()=>conteoPorPersona(delTipo,periodo.desde,periodo.hasta),[delTipo,periodo.desde,periodo.hasta]);
 const delPeriodo=visibles.filter(i=>{const r=rangoItem(i)!;return r.desde<=periodo.hasta&&r.hasta>=periodo.desde;})
  .sort((a,b)=>rangoItem(a)!.desde.localeCompare(rangoItem(b)!.desde)||a.nombre.localeCompare(b.nombre));
 const sinFecha=delTipo.filter(i=>i.estado!=='no_aplica'&&!rangoItem(i)).length;
 const enlace=(cambios:Record<string,string>)=>{
  const q=new URLSearchParams({vista:'calendario',modo,mes,semana,tipos:todos?'todos':'',...cambios});
  for(const [k,v] of [...q.entries()])if(!v)q.delete(k);
  return `/aperturas/${proyecto}?${q}`;
 };
 const router=useRouter();
 const irA=(dia:string)=>{setCajon(false);router.push(enlace({mes:dia.slice(0,7),semana:semanaDe(dia)[0].dia}));};
 const paso=(n:number)=>modo==='semana'
  ?enlace({semana:moverDias(dias7[0].dia,7*n),mes:moverDias(dias7[0].dia,7*n+3).slice(0,7)})
  :(m=>enlace({mes:m,semana:semanaDe(m===hoy.slice(0,7)?hoy:`${m}-01`)[0].dia}))(moverMesTexto(mes,n));
 const todosOcultos=personas.length>0&&personas.every(p=>ocultos.has(p.clave));

 return <section className="seccion ap-gcal" data-panel={panel?'abierto':'plegado'} data-cajon={cajon||undefined}>
  <div className="ap-gcal-barra">
   <button type="button" className="ap-gcal-menu" aria-label={panel?'Plegar panel':'Mostrar panel'} aria-expanded={panel} onClick={alternarPanel}><Icono nombre="menu" tamano={22}/></button>
   <Link className="ap-gcal-hoy" href={enlace({mes:hoy.slice(0,7),semana:semanaDe(hoy)[0].dia})}>Hoy</Link>
   <Link className="ap-gcal-flecha" href={paso(-1)} aria-label="Anterior">‹</Link>
   <Link className="ap-gcal-flecha" href={paso(1)} aria-label="Siguiente">›</Link>
   <h2 className="ap-gcal-titulo">{tituloPeriodo(modo,mes,semana)}</h2>
   <div className="ap-gcal-modo" role="group" aria-label="Vista">
    <Link href={enlace({modo:'mes'})} aria-current={modo==='mes'||undefined}>Mes</Link>
    <Link href={enlace({modo:'semana'})} aria-current={modo==='semana'||undefined}>Semana</Link>
   </div>
  </div>
  <div className="ap-gcal-cuerpo">
   {cajon&&<button type="button" className="ap-gcal-velo" aria-label="Cerrar panel" onClick={()=>setCajon(false)}/>}
   {/* key: el mini mes vuelve al periodo visible cada vez que cambia la vista principal. */}
   <PanelCalendario key={modo==='semana'?semana:mes} hoy={hoy} modo={modo} mes={mes} semana={semana} personas={personas} ocultos={ocultos} conteo={conteo} todos={todos} edita={edita}
    irA={irA} alternar={alternar} enlaceTipos={enlace({tipos:todos?'':'todos'})} alElegir={()=>setCajon(false)}
    programar={()=>{setCajon(false);setAbierta({tipo:'dia',dia:hoy>=periodo.desde&&hoy<=periodo.hasta?hoy:periodo.desde});}}/>
   <div className="ap-gcal-vista">
    {sinFecha>0&&<p className="ap-nota">{sinFecha} {sinFecha===1?'tarea sin fecha':'tareas sin fecha'}.{edita?' Prográmalas con «+ Programar tarea».':''}</p>}
    {todosOcultos?<p className="aviso">Ocultaste a todos los responsables. Marca alguno en el panel.</p>
     :modo==='mes'?<VistaMes mes={mes} hoy={hoy} items={visibles} colorDe={colorDe} tono={tono} abrirDia={dia=>setAbierta({tipo:'dia',dia})} abrirItem={item=>setAbierta({tipo:'item',item})} abrirMas={(dia,ancla)=>setMas({dia,ancla})}/>
     :<VistaSemana semana={semana} hoy={hoy} items={visibles} personas={personas} colorDe={colorDe} tono={tono} abrirDia={dia=>setAbierta({tipo:'dia',dia})} abrirItem={item=>setAbierta({tipo:'item',item})}/>}
    {!todosOcultos&&delPeriodo.length===0&&<p className="ap-nota ap-gcal-vacio">Sin tareas programadas {modo==='semana'?'esta semana':'este mes'}.{edita?' Usa «+ Programar tarea».':''}</p>}
    {/* En celular: tarjetas del periodo en orden, con el color de su responsable. */}
    {!todosOcultos&&<div className="ap-cal-agenda">
     {delPeriodo.length===0?null:<ul>{delPeriodo.map(i=><li key={i.id}><button type="button" data-tono={tono(i)} style={{borderLeftColor:colorDe(i)}} onClick={()=>setAbierta({tipo:'item',item:i})}>
      <strong>{tono(i)==='alerta'&&'! '}{i.nombre}</strong><small>{rangoTexto(i)} · {nombreEstado(i)} · {personaDe(i)?.nombre??'Sin asignar'}</small><small>{grupoTexto(i)}</small></button></li>)}</ul>}
    </div>}
   </div>
  </div>
  {mas&&<TarjetaDia dia={mas.dia} ancla={mas.ancla} items={visibles} colorDe={colorDe} tono={tono} abrirItem={item=>setAbierta({tipo:'item',item})} cerrar={()=>setMas(null)}/>}
  <Ventana grande={abierta?.tipo==='dia'} abierta={abierta!==null} alCerrar={()=>setAbierta(null)} titulo={abierta?.tipo==='dia'?fechaLarga(abierta.dia):abierta?.tipo==='item'?abierta.item.nombre:''}>
   {abierta?.tipo==='dia'&&<Dia dia={abierta.dia} items={items} visibles={visibles} personas={personas} proyecto={proyecto} tono={tono} edita={edita} abrir={item=>setAbierta({tipo:'item',item})} listo={()=>setAbierta(null)}/>}
   {abierta?.tipo==='item'&&<Tarea item={abierta.item} persona={personaDe(abierta.item)} proyecto={proyecto} edita={edita} listo={()=>setAbierta(null)}/>}
  </Ventana>
 </section>;
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
