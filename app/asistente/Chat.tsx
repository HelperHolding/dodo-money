'use client';
import {useState,useRef,useEffect} from 'react';
import Link from 'next/link';
import type {FuenteIA,MensajeIA} from '@/lib/ia/validacion';
import estilos from './chat.module.css';
import {Icono as IconoApp,type NombreIcono} from '@/components/Icono';
import {ThinkingOrb} from 'thinking-orbs';

/** Tinta de los orbes: el naranja de texto de la marca (5.9:1 sobre blanco). */
const TINTA_ORBE='#b83800';

type Mensaje=MensajeIA&{fuentes?:FuenteIA[]};
function Icono({tipo}:{tipo:'brillo'|'enviar'|'nuevo'|'fuente'}) {
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tipo==='brillo'?<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="M20 2v4M18 4h4"/></>:tipo==='enviar'?<><path d="M12 19V5m-6 6 6-6 6 6"/></>:tipo==='nuevo'?<><path d="M12 5v14M5 12h14"/></>:<><path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>}</svg>;
}
const sugerencias:{titulo:string;texto:string;icono:NombreIcono}[]=[{titulo:'Costos de productos',texto:'¿Cuál era el costo de Bacorn BBQ Grande el 1 de octubre?',icono:'billete'},{titulo:'Revisar cortes',texto:'¿Qué diferencias hubo en los cortes del 1 al 6 de octubre?',icono:'lista'},{titulo:'Ventas por periodo',texto:'¿Cuánto vendimos del 1 al 6 de octubre?',icono:'grafica'},{titulo:'Cómo usar DODO MX',texto:'¿Cómo consulto las ventas y los costos?',icono:'libro'}];

export function Chat({sucursales,sucursalInicial,gerente,conectado}:{sucursales:{id:string;nombre:string}[];sucursalInicial:string|null;gerente:boolean;conectado:boolean}) {
 const [sucursal,setSucursal]=useState(sucursalInicial??''),[mensajes,setMensajes]=useState<Mensaje[]>([]),[pregunta,setPregunta]=useState(''),[pendiente,setPendiente]=useState(false),[enviada,setEnviada]=useState(''),[error,setError]=useState('');
 const bloqueo=useRef(false),conversacion=useRef<HTMLDivElement>(null),entrada=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{const panel=conversacion.current;if(!panel||(!mensajes.length&&!pendiente))return;panel.scrollTop=panel.scrollHeight;},[mensajes,pendiente,error]);
 function nueva(){setMensajes([]);setError('');setPregunta('');setEnviada('');}
 async function enviar(e:React.FormEvent){
  e.preventDefault();if(bloqueo.current||!pregunta.trim()||!conectado)return;
  bloqueo.current=true;setPendiente(true);setError('');setEnviada(pregunta.trim());
  const nuevo:Mensaje={role:'user',content:pregunta.trim()},historia=[...mensajes,nuevo].slice(-9);
  while(historia[0]?.role==='assistant')historia.shift();
  while(historia.length>1&&historia.reduce((s,m)=>s+m.content.length,0)>20000)historia.splice(0,2);
  try{
   const r=await fetch('/api/asistente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sucursal:sucursal||null,mensajes:historia.map(({role,content})=>({role,content}))})});
   if(r.redirected)throw Error('Inicia sesión nuevamente para continuar.');
   if(!r.headers.get('content-type')?.includes('application/json'))throw Error('El asistente no está disponible. Vuelve a intentar.');
   const dato=await r.json();if(!r.ok)throw Error(dato.error??'No se pudo consultar.');
   setMensajes([...mensajes,nuevo,{role:'assistant',content:dato.texto,fuentes:dato.fuentes}]);setPregunta('');
  }catch(e){setError(e instanceof Error?e.message:'No se pudo consultar.');}
  finally{bloqueo.current=false;setPendiente(false);setEnviada('');}
 }
 return <div className={estilos.chat} data-pensando={pendiente?"si":undefined}>
  <header className={estilos.cabecera}>
   <div className={estilos.identidad}><span className={estilos.avatar} aria-hidden="true"><ThinkingOrb state={pendiente?"working":"breathing"} size={32} theme="light" color={TINTA_ORBE}/></span><div><strong>Asistente DODO MX</strong><span className={estilos.estado}><i className={conectado?estilos.activo:undefined}/>{conectado?'Listo para ayudarte':'Conexión pendiente'}</span></div></div>
   <div className={estilos.controles}><label className={estilos.sucursal}><span>Sucursal</span><select aria-label="Sucursal de la conversación" value={sucursal} disabled={gerente||pendiente} onChange={e=>{setSucursal(e.target.value);nueva();}}>{!gerente&&<option value="">Consolidado</option>}{sucursales.map(s=><option value={s.id} key={s.id}>{s.nombre}</option>)}</select></label><button type="button" className={estilos.nueva} disabled={pendiente} onClick={nueva}><Icono tipo="nuevo"/><span>Nuevo chat</span></button></div>
  </header>
  {!conectado&&<div className={estilos.aviso}><span>Estamos preparando la conexión con Anthropic.</span> Mientras tanto, visita los <Link href="/conocimiento">manuales y preguntas</Link>.</div>}
  <div className={estilos.conversacion} ref={conversacion} role="log" aria-label="Conversación" aria-live="polite" aria-relevant="additions text">
   {!mensajes.length&&!pendiente&&<div className={estilos.bienvenida}><span className={estilos.saludoIcono} aria-hidden="true"><ThinkingOrb state="breathing" size={64} theme="light" color={TINTA_ORBE}/></span><h2>¿Qué quieres consultar hoy?</h2><p>Tus números, con contexto y fuentes.<br/>Costos, ventas, cortes y ayuda para usar DODO MX.</p><div className={estilos.sugerencias}>{sugerencias.map(s=><button type="button" key={s.titulo} disabled={!conectado} onClick={()=>{setPregunta(s.texto);entrada.current?.focus();}}><span className={estilos.sugerenciaIcono}><IconoApp nombre={s.icono} tamano={18}/></span><strong>{s.titulo}</strong><span>{s.texto}</span></button>)}</div></div>}
   {mensajes.map((m,n)=><article key={n} className={`${estilos.mensaje} ${m.role==='user'?estilos.usuario:estilos.asistente}`}><span className={estilos.autor}>{m.role==='user'?'Tú':<><ThinkingOrb state="breathing" size={20} theme="light" color={TINTA_ORBE} paused={n<mensajes.length-1} aria-hidden/>DODO MX</>}</span><div className={estilos.burbuja}><p>{m.content}</p>{!!m.fuentes?.length&&<div className={estilos.fuentes}><small>Fuentes consultadas</small><ul>{m.fuentes.map(f=><li key={f.href}><Link href={f.href}><Icono tipo="fuente"/>{f.titulo}</Link></li>)}</ul></div>}</div></article>)}
   {pendiente&&<><article className={`${estilos.mensaje} ${estilos.usuario}`}><span className={estilos.autor}>Tú</span><div className={estilos.burbuja}><p>{enviada}</p></div></article><div className={estilos.escribiendo} role="status"><ThinkingOrb state="searching" size={20} theme="light" color={TINTA_ORBE} aria-hidden/>Consultando tus fuentes…</div></>}
  </div>
  <div className={estilos.pie}>{error&&<p role="alert" className={estilos.error}>{error} Tu pregunta sigue disponible para volver a intentar.</p>}<form onSubmit={enviar} className={estilos.compositor}><label className={estilos.sr} htmlFor="pregunta-ia">Tu pregunta</label><textarea id="pregunta-ia" ref={entrada} rows={2} maxLength={2000} required value={pregunta} onChange={e=>setPregunta(e.target.value)} disabled={pendiente||!conectado} placeholder={conectado?'Pregunta sobre tu operación…':'El chat estará disponible al conectar Anthropic'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/><button type="submit" aria-label="Enviar pregunta" title="Enviar pregunta" disabled={pendiente||!conectado||!pregunta.trim()}><Icono tipo="enviar"/></button></form><div className={estilos.ayuda}><span>{gerente?'Consultas solo de tu sucursal.':'Cambiar de sucursal inicia otro chat.'}</span><span>Enter para enviar · Shift + Enter para otra línea</span></div><details className={estilos.privacidad}><summary>Privacidad y uso de la IA</summary><p>La conversación se conserva solo en esta pestaña. Se registra usuario, fecha, consumo y fuentes; no se guardan las preguntas ni las respuestas. Las consultas y los datos necesarios se envían a Anthropic. Verifica las fuentes antes de tomar decisiones.</p></details></div>
 </div>;
}
