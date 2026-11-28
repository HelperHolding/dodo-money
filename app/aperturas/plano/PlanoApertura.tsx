"use client";
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {aItemChecklist,nombreEstado,type ItemApertura,type ItemChecklist} from '@/lib/aperturas';
import {ETIQUETA_COLOR,aCoordenada,colorMarca,conteoColores,necesitaAtencion,type ColorMarca} from '@/lib/aperturas/plano';
import {fechaTexto,pesos} from '@/lib/formato';
import {VentanaEstado} from '../VentanaEstado';
import {SubirPlano} from './SubirPlano';
import {borrarPlano,colocarMarca,quitarMarca} from './acciones';

export type HojaPlano={id:string;hoja:string;nombre:string;version_fecha:string;ancho:number;alto:number;revision:number};
export type MarcaPlano={item_id:string;x:number;y:number};
export type ItemPlano=Pick<ItemApertura,'id'|'clave'|'nombre'|'tipo'|'etapa'|'categoria'|'estado'|'responsable'|'inicio'|'fin'|'cantidad'|'recibido'|'evidencia'|'notas'|'revision'>&Partial<Pick<ItemApertura,'precio'|'orden_id'|'factura_id'>>&{unidad:string|null};
// Precio, orden y factura solo llegan y se pintan con la vista completa (admin y corporativo); un responsable no los recibe (HD-27).

const COLORES:ColorMarca[]=['gris','amarillo','azul','morado','verde'];
const ZOOMS=[0.5,0.75,1,1.5,2,3,4];
const ddmmaaaa=(f:string)=>{const [a,m,d]=f.slice(0,10).split('-');return `${d}/${m}/${a}`;};
type Arrastre={id:string;pointer:number;movio:boolean;x:number;y:number};

/** Pestaña «Plano» de una apertura (HD-14): hojas, marcas por etapa, leyenda, filtros, zoom, ficha, modo Ubicar e impresión. */
export function PlanoApertura({proyecto,base,hoy,hojas,activa,marcas:marcasIniciales,url,items,edita,completo,fotos}:{proyecto:string;base:string;hoy:string;hojas:HojaPlano[];activa:HojaPlano|null;marcas:MarcaPlano[];url:string|null;items:ItemPlano[];edita:boolean;completo:boolean;fotos?:Record<string,string>}) {
 const router=useRouter();
 const [porId,setPorId]=useState<Record<string,ItemPlano>>(()=>Object.fromEntries(items.map(i=>[i.id,i])));
 const [marcas,setMarcas]=useState<Record<string,{x:number;y:number}>>(()=>Object.fromEntries(marcasIniciales.map(m=>[m.item_id,{x:Number(m.x),y:Number(m.y)}])));
 const [zoom,setZoom]=useState(1),[resalte,setResalte]=useState<ColorMarca|null>(null),[atencion,setAtencion]=useState(false),[responsable,setResponsable]=useState('');
 const [ficha,setFicha]=useState<string|null>(null),[editando,setEditando]=useState<ItemChecklist|null>(null);
 const [ubicar,setUbicar]=useState(false),[elegida,setElegida]=useState<string|null>(null),[busqueda,setBusqueda]=useState('');
 const [subir,setSubir]=useState<'nueva'|'reemplazar'|null>(null),[error,setError]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false);
 const lienzo=useRef<HTMLDivElement>(null),arrastre=useRef<Arrastre|null>(null),recienArrastrada=useRef(false);

 // Lo que traiga la página al recargarse entra sin pisar un cambio más nuevo hecho aquí (gana la revisión mayor).
 useEffect(()=>setPorId(actual=>{let cambio=false;const r={...actual};
  for(const i of items){const a=r[i.id];if(a&&a.revision>=i.revision)continue;r[i.id]=i;cambio=true;}
  return cambio?r:actual;}),[items]);
 useEffect(()=>{setMarcas(Object.fromEntries(marcasIniciales.map(m=>[m.item_id,{x:Number(m.x),y:Number(m.y)}])));},[marcasIniciales]);
 // Al cambiar de hoja: sin ficha, sin partida elegida y zoom al 100 %.
 useEffect(()=>{setFicha(null);setElegida(null);setZoom(1);setResalte(null);setError('');},[activa?.id]);
 // La URL firmada cambia en cada recarga; se conserva la primera de esta versión para no volver a bajar la imagen.
 const clave=activa?`${activa.id}:${activa.revision}`:'';
 const [imagen,setImagen]=useState({clave,url});
 const urlImagen=imagen.clave===clave&&imagen.url?imagen.url:url;
 useEffect(()=>setImagen(a=>a.clave===clave&&a.url?a:{clave,url}),[clave,url]);

 const marcadas=useMemo(()=>Object.keys(marcas).map(id=>porId[id]).filter((i):i is ItemPlano=>!!i),[marcas,porId]);
 const conteo=useMemo(()=>conteoColores(marcadas,hoy),[marcadas,hoy]);
 const responsables=useMemo(()=>[...new Set(marcadas.map(i=>i.responsable).filter((r):r is string=>!!r))].sort((a,b)=>a.localeCompare(b,'es')),[marcadas]);
 const visibles=marcadas.filter(i=>(!atencion||necesitaAtencion(i,hoy))&&(!responsable||i.responsable===responsable));
 const sinUbicar=useMemo(()=>{const q=busqueda.trim().toLocaleLowerCase();
  return Object.values(porId).filter(i=>(i.tipo==='equipo'||i.tipo==='referencia'||i.categoria!==null)&&!marcas[i.id]&&(!q||`${i.clave} ${i.nombre}`.toLocaleLowerCase().includes(q))).sort((a,b)=>a.clave.localeCompare(b.clave,'es',{numeric:true}));},[porId,marcas,busqueda]);
 const actual=ficha?porId[ficha]:null;

 const posicion=(clientX:number,clientY:number)=>{const r=lienzo.current!.getBoundingClientRect();return aCoordenada(clientX-r.left,clientY-r.top,r.width,r.height);};
 const guardarPosicion=async(id:string,p:{x:number;y:number},antes:{x:number;y:number}|undefined)=>{
  if(!activa)return;setError('');
  try{const res=await colocarMarca(activa.id,id,p.x,p.y);if('error' in res)throw new Error(res.error);}
  catch(e){setMarcas(m=>{const r={...m};if(antes)r[id]=antes;else delete r[id];return r;});setError(e instanceof Error&&e.message?e.message:'No se pudo guardar la marca.');}
 };
 const quitar=async(id:string)=>{if(!activa||ocupado)return;const antes=marcas[id];setOcupado(true);setError('');
  try{const res=await quitarMarca(activa.id,id);if('error' in res){setError(res.error);return;}
   setMarcas(m=>{const r={...m};delete r[id];return r;});setFicha(null);}
  catch{setMarcas(m=>antes?{...m,[id]:antes}:m);setError('No se pudo quitar la marca. Recarga la página.');}finally{setOcupado(false);}};
 const borrar=async()=>{if(!activa||ocupado)return;
  if(!window.confirm(`¿Borrar la hoja ${activa.hoja} y sus ${Object.keys(marcas).length} marcas? Esto no se puede deshacer.`))return;
  setOcupado(true);setError('');
  try{const res=await borrarPlano(proyecto,activa.id);if('error' in res){setError(res.error);return;}
   if(res.aviso)setAviso(res.aviso);router.replace(`${base}?vista=plano`);router.refresh();}
  catch{setError('No se pudo confirmar el borrado. Recarga la página.');}finally{setOcupado(false);}};
 const terminado=(hoja:string,av?:string)=>{setSubir(null);setAviso(av??'');router.replace(`${base}?vista=plano&hoja=${encodeURIComponent(hoja)}`);router.refresh();};

 const clicPlano=(e:React.MouseEvent<HTMLDivElement>)=>{
  if(!ubicar||!elegida||!activa)return;
  const id=elegida,p=posicion(e.clientX,e.clientY);
  setMarcas(m=>({...m,[id]:p}));setElegida(null);void guardarPosicion(id,p,undefined);
 };
 const alPresionar=(e:React.PointerEvent<HTMLButtonElement>,id:string)=>{
  recienArrastrada.current=false;
  if(!ubicar||e.button!==0)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  arrastre.current={id,pointer:e.pointerId,movio:false,...marcas[id]};
 };
 const alMover=(e:React.PointerEvent<HTMLButtonElement>)=>{
  const a=arrastre.current;if(!a||a.pointer!==e.pointerId)return;
  const p=posicion(e.clientX,e.clientY);a.movio=true;setMarcas(m=>({...m,[a.id]:p}));
 };
 const alSoltar=(e:React.PointerEvent<HTMLButtonElement>)=>{
  const a=arrastre.current;if(!a||a.pointer!==e.pointerId)return;arrastre.current=null;
  if(!a.movio)return;
  recienArrastrada.current=true;
  void guardarPosicion(a.id,posicion(e.clientX,e.clientY),{x:a.x,y:a.y});
 };
 const cambiarZoom=(paso:number)=>setZoom(z=>{const i=ZOOMS.indexOf(z);return ZOOMS[Math.min(ZOOMS.length-1,Math.max(0,(i<0?2:i)+paso))];});

 return <section className="seccion ap-plano" aria-label="Plano de la apertura">
  <nav className="ap-plano-hojas" aria-label="Hojas del plano">
   {hojas.map(h=><Link key={h.id} href={`${base}?vista=plano&hoja=${encodeURIComponent(h.hoja)}`} aria-current={activa?.id===h.id?'page':undefined} title={h.nombre}>{h.hoja}</Link>)}
   {edita&&<button type="button" className="boton boton-secundario" onClick={()=>setSubir(s=>s==='nueva'?null:'nueva')} aria-expanded={subir==='nueva'}>Agregar hoja</button>}
  </nav>
  {aviso&&<p role="status" className="aviso aviso-info">{aviso}</p>}
  {edita&&subir==='nueva'&&<SubirPlano proyecto={proyecto} hoy={hoy} revision={null} alTerminar={terminado} alCancelar={()=>setSubir(null)}/>}
  {!activa?<p className="ap-nota">{edita?'Aún no hay planos. Usa «Agregar hoja» para subir el primero (PDF, PNG o JPG).':'Aún no hay planos de esta apertura.'}</p>:<>
  <div className="ap-plano-barra">
   <div className="ap-plano-zoom" role="group" aria-label="Acercar o alejar">
    <button type="button" className="boton boton-secundario" onClick={()=>cambiarZoom(-1)} disabled={zoom<=ZOOMS[0]} aria-label="Alejar">−</button>
    <button type="button" className="boton boton-secundario" onClick={()=>setZoom(1)} aria-label="Ajustar al ancho (100 %)">{Math.round(zoom*100)} %</button>
    <button type="button" className="boton boton-secundario" onClick={()=>cambiarZoom(1)} disabled={zoom>=ZOOMS[ZOOMS.length-1]} aria-label="Acercar">+</button>
   </div>
   <label className="ap-plano-casilla"><input type="checkbox" checked={atencion} onChange={e=>setAtencion(e.target.checked)}/>Necesita mi atención</label>
   <div className="campo ap-plano-responsable"><label htmlFor="ap-plano-resp">Responsable</label><select id="ap-plano-resp" value={responsable} onChange={e=>setResponsable(e.target.value)}><option value="">Todos</option>{responsables.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
   <div className="acciones">
    {edita&&<button type="button" className="boton boton-secundario" aria-pressed={ubicar} onClick={()=>{setUbicar(u=>!u);setElegida(null);}}>{ubicar?'Terminar de ubicar':'Ubicar'}</button>}
    {edita&&<button type="button" className="boton boton-secundario" onClick={()=>setSubir(s=>s==='reemplazar'?null:'reemplazar')} aria-expanded={subir==='reemplazar'}>Reemplazar archivo</button>}
    <button type="button" className="boton boton-secundario" onClick={()=>window.print()}>Imprimir / PDF</button>
    {edita&&<button type="button" className="boton boton-secundario ap-plano-borrar" onClick={borrar} disabled={ocupado}>Borrar hoja</button>}
   </div>
  </div>
  {edita&&subir==='reemplazar'&&<SubirPlano key={clave} proyecto={proyecto} hoy={hoy} hoja={activa.hoja} nombre={activa.nombre} revision={activa.revision} alTerminar={terminado} alCancelar={()=>setSubir(null)}/>}
  {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
  <div className="ap-plano-cuerpo" data-ubicar={ubicar||undefined}>
   {edita&&ubicar&&<aside className="ap-plano-panel" aria-label="Partidas sin ubicar">
    <h3>Sin ubicar en {activa.hoja} · {sinUbicar.length}</h3>
    <div className="campo"><label htmlFor="ap-plano-buscar">Buscar por clave o nombre</label><input id="ap-plano-buscar" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="PL-012, campana…"/></div>
    {elegida&&porId[elegida]&&<p className="ap-plano-instruccion" role="status">Da clic en el plano donde va <strong>{porId[elegida].clave}</strong>. <button type="button" className="boton-enlace" onClick={()=>setElegida(null)}>Cancelar</button></p>}
    <ul className="ap-plano-pendientes">{sinUbicar.slice(0,60).map(i=><li key={i.id}><button type="button" aria-pressed={elegida===i.id} onClick={()=>setElegida(e=>e===i.id?null:i.id)}><span className="ap-plano-punto" data-color={colorMarca(i,hoy).color}/><strong>{i.clave}</strong><span>{i.nombre}</span></button></li>)}</ul>
    {sinUbicar.length>60&&<p className="ap-nota">Mostrando 60 de {sinUbicar.length}. Busca para encontrar las demás.</p>}
    {!sinUbicar.length&&<p className="ap-nota">Todas las partidas de equipo están ubicadas en esta hoja.</p>}
   </aside>}
   <div className="ap-plano-imprimible">
    <h3 className="ap-plano-titulo">{activa.hoja} · {activa.nombre} · versión {ddmmaaaa(activa.version_fecha)}</h3>
    <div className="ap-plano-marco">
     {urlImagen?<div ref={lienzo} className="ap-plano-lienzo" style={{width:`${zoom*100}%`,aspectRatio:`${activa.ancho} / ${activa.alto}`}} data-colocando={ubicar&&elegida?true:undefined} data-resalte={resalte??undefined} onClick={clicPlano}>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada del bucket privado */}
      <img src={urlImagen} alt={`Plano ${activa.hoja}: ${activa.nombre}`} width={activa.ancho} height={activa.alto} draggable={false}/>
      {visibles.map(i=>{const m=colorMarca(i,hoy),p=marcas[i.id];return <button key={i.id} type="button" className="ap-plano-marca"
        data-color={m.color} data-alerta={m.alerta||undefined} data-no-aplica={m.noAplica||undefined} data-atenuada={resalte&&resalte!==m.color?true:undefined} data-activa={ficha===i.id||undefined}
        style={{left:`${p.x*100}%`,top:`${p.y*100}%`}} title={`${i.clave} · ${i.nombre}`} aria-label={`${i.clave} · ${i.nombre} · ${nombreEstado(i)}`}
        onPointerDown={e=>alPresionar(e,i.id)} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={()=>{const a=arrastre.current;arrastre.current=null;if(a)setMarcas(x=>({...x,[a.id]:{x:a.x,y:a.y}}));}}
        onClick={e=>{e.stopPropagation();if(recienArrastrada.current){recienArrastrada.current=false;return;}setFicha(f=>f===i.id?null:i.id);}}>{m.porValidar?'?':''}</button>;})}
     </div>:<p className="aviso aviso-error">No se pudo abrir la imagen del plano. Recarga la página.</p>}
    </div>
    <ul className="ap-plano-leyenda" aria-label="Leyenda por etapa">{COLORES.map(c=><li key={c}><button type="button" aria-pressed={resalte===c} onClick={()=>setResalte(r=>r===c?null:c)}><span className="ap-plano-punto" data-color={c}/>{ETIQUETA_COLOR[c]}<strong>{conteo[c]}</strong></button></li>)}
     <li className="ap-plano-ley-extra"><span className="ap-plano-punto" data-alerta/>Bloqueado o vencido</li><li className="ap-plano-ley-extra"><span className="ap-plano-punto">?</span>Por validar</li></ul>
   </div>
   {actual&&<aside className="ap-plano-ficha" aria-labelledby="ap-plano-ficha-titulo">
    {fotos&&(fotos[actual.id]?<img className="ap-miniatura-ficha" src={fotos[actual.id]} alt={actual.nombre} loading="lazy"/>:<span className="ap-miniatura-ficha" aria-hidden="true"/>)}
    <header><div><h3 id="ap-plano-ficha-titulo">{actual.nombre}</h3><p className="ap-nota">{actual.clave} · <span className="ap-plano-punto" data-color={colorMarca(actual,hoy).color}/> {nombreEstado(actual)}</p></div>
     <button type="button" className="boton boton-secundario" onClick={()=>setFicha(null)} aria-label="Cerrar ficha">×</button></header>
    <dl>
     {actual.cantidad!==null&&<><dt>Cantidad / recibido</dt><dd>{actual.recibido} / {actual.cantidad}{actual.unidad?` ${actual.unidad}`:''}</dd></>}
     {completo&&<><dt>Precio</dt><dd>{actual.precio==null?'Sin precio':pesos(actual.precio)}</dd></>}
     <dt>Responsable</dt><dd>{actual.responsable??'Sin asignar'}</dd>
     <dt>Fecha prevista</dt><dd>{actual.fin??actual.inicio?fechaTexto((actual.fin??actual.inicio)!):'Sin fecha'}</dd>
     {actual.notas&&<><dt>Notas</dt><dd>{actual.notas}</dd></>}
    </dl>
    <p className="ap-plano-ligas">
     {completo&&actual.orden_id&&<Link href={`/compras/ordenes/${actual.orden_id}`}>Orden de compra</Link>}
     {completo&&actual.factura_id&&<Link href={`/compras/facturas/${actual.factura_id}`}>Factura</Link>}
     <Link href={`${base}/items/${actual.id}`}>Ficha del concepto</Link>
    </p>
    {edita&&<div className="acciones"><button type="button" className="boton" onClick={()=>setEditando(aItemChecklist({...actual,original:{unidad:actual.unidad}}))}>Cambiar etapa</button>
     <button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>quitar(actual.id)}>Quitar del plano</button></div>}
   </aside>}
  </div></>}
  {edita&&<VentanaEstado concepto={editando} alCerrar={()=>setEditando(null)} alGuardar={c=>{setPorId(a=>{const i=a[c.id];return i&&i.revision<c.revision?{...a,[c.id]:{...i,estado:c.estado,evidencia:c.evidencia,notas:c.notas,cantidad:c.cantidad,recibido:c.recibido,revision:c.revision}}:a;});router.refresh();}}/>}
 </section>;
}
