"use client";
import {useState} from 'react';
import {clienteNavegador} from '@/lib/supabase/navegador';
import {guardarPlano} from './acciones';

const BUCKET='aperturas-planos';
const MAXIMO=25*1024*1024;
const ANCHO_MAXIMO=3000,PIXELES_MAXIMOS=16_000_000;
type Imagen={blob:Blob;ext:'png'|'jpg';tipo:string;ancho:number;alto:number};

/** Primera página del PDF a PNG con pdf.js (cargado solo al usarse, en el navegador). */
async function pdfAPng(archivo:File):Promise<Imagen> {
 const pdfjs=await import('pdfjs-dist');
 // Worker como archivo aparte del paquete: webpack lo copia y da su URL (recomendado para Next/webpack).
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
 const tarea=pdfjs.getDocument({data:new Uint8Array(await archivo.arrayBuffer())});
 try{
  const doc=await tarea.promise;
  const pagina=await doc.getPage(1);
  const base=pagina.getViewport({scale:1});
  // ~3000 px de ancho como máximo, sin pasar de 16 Mpx (límite de canvas en celulares).
  const escala=Math.min(ANCHO_MAXIMO/base.width,Math.sqrt(PIXELES_MAXIMOS/(base.width*base.height)));
  const vista=pagina.getViewport({scale:escala});
  const canvas=document.createElement('canvas');
  canvas.width=Math.floor(vista.width);canvas.height=Math.floor(vista.height);
  await pagina.render({canvas,viewport:vista}).promise;
  const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));
  if(!blob)throw new Error('No se pudo convertir el PDF a imagen.');
  return {blob,ext:'png',tipo:'image/png',ancho:canvas.width,alto:canvas.height};
 }finally{await tarea.destroy();}
}

async function medidas(archivo:File):Promise<{ancho:number;alto:number}> {
 const bmp=await createImageBitmap(archivo);
 try{return {ancho:bmp.width,alto:bmp.height};}finally{bmp.close();}
}

const tipoDe=(f:File)=>f.type==='application/pdf'||/\.pdf$/i.test(f.name)?'pdf':f.type==='image/png'||/\.png$/i.test(f.name)?'png':f.type==='image/jpeg'||/\.jpe?g$/i.test(f.name)?'jpg':null;

/** Alta o reemplazo de una hoja. Sube directo al bucket con el cliente del navegador (RLS: solo administración). */
export function SubirPlano({proyecto,hoy,hoja:hojaFija,nombre:nombreInicial,revision,alTerminar,alCancelar}:{proyecto:string;hoy:string;hoja?:string;nombre?:string;revision:number|null;alTerminar:(hoja:string,aviso?:string)=>void;alCancelar:()=>void}) {
 const [ocupado,setOcupado]=useState(''),[error,setError]=useState('');
 const reemplazo=revision!==null;
 return <form className="formulario ap-plano-subir" onSubmit={async e=>{e.preventDefault();if(ocupado)return;
  const fd=new FormData(e.currentTarget);
  const hoja=String(fd.get('hoja')??hojaFija??'').trim(),nombre=String(fd.get('nombre')??'').trim(),version=String(fd.get('version')??'');
  const archivo=fd.get('archivo');
  if(!/^[A-Za-z0-9._-]{1,20}$/.test(hoja)){setError('La hoja debe tener de 1 a 20 caracteres: letras, números, punto, guion o guion bajo.');return;}
  if(!nombre){setError('Escribe el nombre de la hoja.');return;}
  if(!(archivo instanceof File)||!archivo.size){setError('Elige el archivo del plano.');return;}
  if(archivo.size>MAXIMO){setError('El archivo pesa más de 25 MB.');return;}
  const tipo=tipoDe(archivo);if(!tipo){setError('El archivo debe ser PDF, PNG o JPG.');return;}
  setError('');
  const supabase=clienteNavegador(),subidos:string[]=[];
  const limpiar=async()=>{if(subidos.length)await supabase.storage.from(BUCKET).remove(subidos).catch(()=>undefined);};
  try{
   let imagen:Imagen;
   if(tipo==='pdf'){setOcupado('Convirtiendo el PDF…');imagen=await pdfAPng(archivo);
    if(imagen.blob.size>MAXIMO){setError('La imagen del PDF pesa más de 25 MB.');return;}}
   else imagen={blob:archivo,ext:tipo,tipo:tipo==='png'?'image/png':'image/jpeg',...await medidas(archivo)};
   // Rutas {proyecto}/{uuid}.{pdf|png|jpg}: randomUUID ya es minúsculas, como exige la política del bucket.
   const rutaArchivo=`${proyecto}/${crypto.randomUUID()}.${tipo}`;
   const rutaImagen=tipo==='pdf'?`${proyecto}/${crypto.randomUUID()}.${imagen.ext}`:rutaArchivo;
   setOcupado('Subiendo…');
   const a=await supabase.storage.from(BUCKET).upload(rutaArchivo,archivo,{contentType:tipo==='pdf'?'application/pdf':imagen.tipo,upsert:false});
   if(a.error){setError(`No se pudo subir el archivo: ${a.error.message}`);return;}
   subidos.push(rutaArchivo);
   if(rutaImagen!==rutaArchivo){
    const b=await supabase.storage.from(BUCKET).upload(rutaImagen,imagen.blob,{contentType:imagen.tipo,upsert:false});
    if(b.error){await limpiar();setError(`No se pudo subir la imagen: ${b.error.message}`);return;}
    subidos.push(rutaImagen);
   }
   setOcupado('Guardando…');
   let res:Awaited<ReturnType<typeof guardarPlano>>;
   try{res=await guardarPlano({proyecto,hoja,nombre,version,archivo:rutaArchivo,imagen:rutaImagen,ancho:imagen.ancho,alto:imagen.alto,revision});}
   catch{
    // Sin respuesta no se sabe si quedó guardada: no se borran los archivos para no dejar la hoja sin imagen.
    setError('No se pudo confirmar si la hoja se guardó. Recarga la página antes de intentar de nuevo.');return;
   }
   if('error' in res){await limpiar();setError(res.error);return;}
   alTerminar(hoja,res.aviso);
  }catch(err){
   await limpiar();
   setError(err instanceof Error&&err.message?`No se pudo preparar el plano: ${err.message}`:'No se pudo preparar el plano.');
  }finally{setOcupado('');}
 }}>
  <h3>{reemplazo?`Reemplazar archivo de ${hojaFija}`:'Agregar hoja'}</h3>
  <div className="rejilla">
   <div className="campo"><label htmlFor="ap-plano-hoja">Hoja (clave)</label><input id="ap-plano-hoja" name="hoja" required maxLength={20} pattern="[A-Za-z0-9._\-]{1,20}" placeholder="E01" defaultValue={hojaFija} readOnly={reemplazo} disabled={!!ocupado}/></div>
   <div className="campo"><label htmlFor="ap-plano-nombre">Nombre</label><input id="ap-plano-nombre" name="nombre" required maxLength={120} placeholder="Equipo de cocina" defaultValue={nombreInicial} disabled={!!ocupado}/></div>
   <div className="campo"><label htmlFor="ap-plano-version">Fecha de versión</label><input id="ap-plano-version" name="version" type="date" required defaultValue={hoy} disabled={!!ocupado}/></div>
  </div>
  <div className="campo"><label htmlFor="ap-plano-archivo">Archivo (PDF, PNG o JPG, hasta 25 MB)</label><input id="ap-plano-archivo" name="archivo" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={!!ocupado}/>
   <small className="ap-nota">Del PDF se usa la primera página. {reemplazo?'Las partidas ubicadas se conservan.':''}</small></div>
  {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
  {ocupado&&<p role="status" className="ap-nota">{ocupado}</p>}
  <div className="acciones"><button type="submit" className="boton" disabled={!!ocupado}>{ocupado?'Procesando…':reemplazo?'Reemplazar':'Subir hoja'}</button><button type="button" className="boton boton-secundario" disabled={!!ocupado} onClick={alCancelar}>Cancelar</button></div>
 </form>;
}
