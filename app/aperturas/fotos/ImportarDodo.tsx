"use client";
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {clienteNavegador} from '@/lib/supabase/navegador';
import {leerMatriz,matrizDeCodigo,type EntradaMatriz,type Matriz} from '@/lib/aperturas/matrizDodo';
import {importarDodo,type FilaImportar} from './acciones';
import {aJpeg} from './imagen';

// Importa foto y sustituto de las matrices de Dodo (.xlsx, hasta ~50 MB). Todo se lee en el navegador;
// las fotos se suben directo al bucket y el servidor solo registra la liga (máximo 400 partidas por llamada).
const BUCKET='aperturas-fotos';
const TANDA=400,PARALELO=4;
const NOMBRE_MATRIZ:Record<Matriz,string>={digital:'Digital',mobiliario:'Mobiliario',neutral:'Neutral',proceso:'Proceso',herramientas:'Herramientas'};
const MIME:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp'};

export type PartidaDodo={id:string;clave:string;nombre:string;codigo:string|null};
type Hallazgo={entrada:EntradaMatriz;archivo:number;bytes:Uint8Array|null};
type Ligada={partida:PartidaDodo;codigo:string;hallazgo:Hallazgo;ruta:string|null};
type Resumen={ligadas:Ligada[];sinFoto:{partida:PartidaDodo;codigo:string;motivo:string}[];sinCodigo:number;hojasSinCodigo:string[]};

const mimeDe=(ruta:string)=>MIME[ruta.slice(ruta.lastIndexOf('.')+1).toLowerCase()]??'application/octet-stream';
const ligaValida=(l:string)=>!l||(/^https:\/\/docs\.google\.com\//.test(l)&&l.length<=500);

export function ImportarDodo({proyecto,partidas}:{proyecto:string;partidas:PartidaDodo[]}) {
 const router=useRouter();
 const modal=useRef<HTMLDialogElement>(null);
 const [archivos,setArchivos]=useState<File[]>([]),[ligas,setLigas]=useState<string[]>([]);
 const [ocupado,setOcupado]=useState(''),[error,setError]=useState(''),[aviso,setAviso]=useState('');
 const [resumen,setResumen]=useState<Resumen|null>(null),[hecho,setHecho]=useState<{ligadas:number;conFoto:number}|null>(null);
 // Fotos subidas que aún no quedaron registradas: se borran si se cancela o falla el guardado.
 const pendientes=useRef<string[]>([]);
 const supabase=()=>clienteNavegador();
 const borrar=async(rutas:string[])=>{if(rutas.length)await supabase().storage.from(BUCKET).remove(rutas).then(()=>undefined,()=>undefined);};

 const reiniciar=()=>{setArchivos([]);setLigas([]);setResumen(null);setHecho(null);setError('');setAviso('');setOcupado('');};
 const abrir=()=>{reiniciar();modal.current?.showModal();};
 const cerrar=async()=>{
  const rutas=pendientes.current;pendientes.current=[];
  await borrar(rutas);
  modal.current?.close();
 };

 const procesar=async()=>{
  if(ocupado)return;
  if(!archivos.length){setError('Elige al menos una matriz .xlsx.');return;}
  const mala=ligas.findIndex(l=>!ligaValida(l.trim()));
  if(mala>=0){setError(`La liga de ${archivos[mala].name} debe empezar con https://docs.google.com/.`);return;}
  setError('');
  const buscados=new Set(partidas.flatMap(p=>p.codigo?[p.codigo]:[]));
  const hallazgos=new Map<string,Hallazgo>();
  const hojasSinCodigo:string[]=[];
  const subidas:string[]=[];
  try{
   const {unzipSync}=await import('fflate');
   for(const [i,f] of archivos.entries()){
    setOcupado(`Leyendo ${f.name} (${i+1} de ${archivos.length})…`);
    // Cede el hilo para que se pinte el mensaje antes de descomprimir.
    await new Promise(r=>setTimeout(r,0));
    const zip=unzipSync(new Uint8Array(await f.arrayBuffer()));
    const {entradas,hojasSinCodigo:hs}=leerMatriz(zip);
    hojasSinCodigo.push(...hs.map(h=>`${f.name}: ${h}`));
    // Gana la primera matriz que tenga foto; solo se guardan los bytes de las fotos que se van a usar.
    for(const [codigo,entrada] of entradas){
     if(!buscados.has(codigo))continue;
     const previo=hallazgos.get(codigo);
     if(previo&&(previo.entrada.foto||!entrada.foto))continue;
     hallazgos.set(codigo,{entrada,archivo:i,bytes:entrada.foto?zip[entrada.foto]?.slice()??null:null}); // copia: no retener el zip entero
    }
   }
   const ligadas:Ligada[]=[],sinFoto:Resumen['sinFoto']=[];
   let sinCodigo=0;
   for(const p of partidas){
    if(!p.codigo){sinCodigo++;continue;}
    const h=hallazgos.get(p.codigo);
    if(h)ligadas.push({partida:p,codigo:p.codigo,hallazgo:h,ruta:null});
    else{const m=matrizDeCodigo(p.codigo);sinFoto.push({partida:p,codigo:p.codigo,motivo:m?`Falta la matriz ${NOMBRE_MATRIZ[m]}`:'Prefijo sin matriz conocida'});}
   }
   const conBytes=ligadas.filter(l=>l.hallazgo.bytes);
   let hechas=0,siguiente=0,fallo=false;
   setOcupado(`Subiendo 0 de ${conBytes.length}`);
   const trabajador=async()=>{
    while(!fallo&&siguiente<conBytes.length){
     const l=conBytes[siguiente++];
     const {bytes,entrada}=l.hallazgo;
     let jpeg:Blob|null=null;
     const original=new Blob([bytes as BlobPart],{type:mimeDe(entrada.foto!)});
     // Las que el navegador no puede leer (emf/wmf) cuentan como sin foto.
     try{jpeg=await aJpeg(original,800);}catch{jpeg=null;}
     if(jpeg){
      const ruta=`${proyecto}/${crypto.randomUUID()}.jpg`;
      const {error:e}=await supabase().storage.from(BUCKET).upload(ruta,jpeg,{contentType:'image/jpeg',upsert:false});
      if(e){fallo=true;throw new Error(`No se pudo subir la foto de ${l.partida.clave}: ${e.message}`);}
      subidas.push(ruta);l.ruta=ruta;
     }
     hechas++;setOcupado(`Subiendo ${hechas} de ${conBytes.length}`);
    }
   };
   // allSettled: si una subida falla, se espera a las demás para borrar todo lo subido sin dejar huérfanas.
   const resultados=await Promise.allSettled(Array.from({length:Math.min(PARALELO,conBytes.length)},trabajador));
   const rechazo=resultados.find((r):r is PromiseRejectedResult=>r.status==='rejected');
   if(rechazo)throw rechazo.reason;
   for(const l of ligadas)if(!l.ruta)sinFoto.push({partida:l.partida,codigo:l.codigo,motivo:l.hallazgo.entrada.foto?'La foto no se pudo leer':'La matriz no trae foto'});
   sinFoto.sort((a,b)=>a.partida.clave.localeCompare(b.partida.clave,'es',{numeric:true}));
   pendientes.current=subidas;
   setResumen({ligadas,sinFoto,sinCodigo,hojasSinCodigo});
  }catch(err){
   await borrar(subidas);
   setError(err instanceof Error&&err.message?err.message:'No se pudieron procesar las matrices.');
  }finally{setOcupado('');}
 };

 const guardar=async()=>{
  if(ocupado||!resumen)return;
  if(!resumen.ligadas.length){setError('Ninguna partida se encontró en las matrices.');return;}
  setError('');
  const filas:FilaImportar[]=resumen.ligadas.map(l=>({item_id:l.partida.id,codigo:l.codigo,matriz:matrizDeCodigo(l.codigo),
   matriz_url:ligas[l.hallazgo.archivo]?.trim()||null,sustituto:l.hallazgo.entrada.sustituto,foto:l.ruta}));
  const tandas:FilaImportar[][]=[];
  for(let i=0;i<filas.length;i+=TANDA)tandas.push(filas.slice(i,i+TANDA));
  const fotosDe=(ts:FilaImportar[][])=>ts.flat().flatMap(f=>f.foto?[f.foto]:[]);
  let ligadas=0,conFoto=0;const avisos:string[]=[];
  for(const [i,t] of tandas.entries()){
   setOcupado(tandas.length>1?`Guardando ${i+1} de ${tandas.length}…`:'Guardando…');
   let res:Awaited<ReturnType<typeof importarDodo>>;
   try{res=await importarDodo(proyecto,t);}
   catch{
    // Sin respuesta no se sabe si esta tanda quedó: solo se borran las fotos de las tandas que no se enviaron.
    const resto=fotosDe(tandas.slice(i+1));pendientes.current=[];await borrar(resto);setResumen(null);
    setOcupado('');setError(`No se pudo confirmar si se guardó${i?` la tanda ${i+1}`:''}. Recarga la página antes de intentar de nuevo.`);router.refresh();return;
   }
   if('error' in res){
    const resto=fotosDe(tandas.slice(i));pendientes.current=[];await borrar(resto);setResumen(null);
    setOcupado('');setError(i?`Se guardaron ${ligadas} partidas; la tanda ${i+1} falló: ${res.error}`:res.error);if(i)router.refresh();return;
   }
   ligadas+=res.ligadas;conFoto+=res.conFoto;if(res.aviso)avisos.push(res.aviso);
   const guardadas=new Set(fotosDe([t]));pendientes.current=pendientes.current.filter(r=>!guardadas.has(r));
  }
  setOcupado('');setHecho({ligadas,conFoto});setAviso([...new Set(avisos)].join(' '));router.refresh();
 };

 return <div className="ap-dodo-barra">
  <button type="button" className="boton boton-secundario" onClick={abrir}>Importar de Dodo</button>
  <dialog ref={modal} className="compra-filtros-modal ap-dodo-modal" aria-labelledby="ap-dodo-titulo" onCancel={e=>{e.preventDefault();if(!ocupado)void cerrar();}}>
   <header className="compra-modal-encabezado"><div><h2 id="ap-dodo-titulo">Importar de Dodo</h2><p>Foto y sustituto de cada partida desde las matrices de Dodo (.xlsx).</p></div></header>
   {hecho?<div className="ap-dodo-resumen">
     <p role="status" className="aviso">Listo: {hecho.ligadas} partidas ligadas, {hecho.conFoto} con foto.</p>
     {aviso&&<p className="aviso aviso-error">{aviso}</p>}
     <div className="acciones"><button type="button" className="boton" onClick={()=>modal.current?.close()}>Cerrar</button></div>
    </div>
   :resumen?<div className="ap-dodo-resumen">
     <div className="ap-dodo-cifras"><div><strong>{resumen.ligadas.length}</strong><span>ligadas</span></div><div><strong>{resumen.ligadas.filter(l=>l.ruta).length}</strong><span>con foto</span></div><div><strong>{resumen.sinFoto.length}</strong><span>sin foto</span></div></div>
     {resumen.sinCodigo>0&&<p className="ap-nota">{resumen.sinCodigo} partidas no tienen código de Dodo.</p>}
     {resumen.hojasSinCodigo.length>0&&<p className="ap-nota">Hojas sin columna de código: {resumen.hojasSinCodigo.join(', ')}.</p>}
     {resumen.sinFoto.length>0&&<details className="ap-dodo-sinfoto" open={resumen.sinFoto.length<=20}><summary>Sin foto en las matrices cargadas ({resumen.sinFoto.length})</summary>
      <ul>{resumen.sinFoto.map(s=><li key={s.partida.id}><span className="ap-dodo-clave">{s.partida.clave}</span><span className="ap-dodo-nombre">{s.partida.nombre}</span><code>{s.codigo}</code><small>{s.motivo}</small></li>)}</ul></details>}
     {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
     {ocupado&&<p role="status" className="ap-nota">{ocupado}</p>}
     <div className="acciones"><button type="button" className="boton" disabled={!!ocupado||!resumen.ligadas.length} onClick={guardar}>{ocupado?'Guardando…':'Guardar'}</button><button type="button" className="boton boton-secundario" disabled={!!ocupado} onClick={cerrar}>Cancelar</button></div>
    </div>
   :<div className="formulario">
     <div className="campo"><label htmlFor="ap-dodo-archivos">Matrices de Dodo (.xlsx)</label>
      <input id="ap-dodo-archivos" type="file" multiple accept=".xlsx" disabled={!!ocupado} onChange={e=>{const fs=[...(e.currentTarget.files??[])];setArchivos(fs);setLigas(fs.map(()=>''));setError('');}}/>
      <small className="ap-nota">Digital, Mobiliario, Neutral, Proceso o Herramientas. Se leen en este dispositivo; puede tardar con archivos grandes.</small></div>
     {archivos.map((f,i)=><div className="campo ap-dodo-liga" key={`${f.name}-${i}`}><label htmlFor={`ap-dodo-liga-${i}`}>Liga de Google Sheets de {f.name} (opcional)</label>
      <input id={`ap-dodo-liga-${i}`} type="url" inputMode="url" maxLength={500} placeholder="https://docs.google.com/spreadsheets/…" value={ligas[i]??''} disabled={!!ocupado} onChange={e=>{const v=e.currentTarget.value;setLigas(ls=>ls.map((l,j)=>j===i?v:l));}}/></div>)}
     {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
     {ocupado&&<p role="status" className="ap-nota">{ocupado}</p>}
     <div className="acciones"><button type="button" className="boton" disabled={!!ocupado||!archivos.length} onClick={procesar}>{ocupado?'Procesando…':'Procesar'}</button><button type="button" className="boton boton-secundario" disabled={!!ocupado} onClick={cerrar}>Cancelar</button></div>
    </div>}
  </dialog>
 </div>;
}
