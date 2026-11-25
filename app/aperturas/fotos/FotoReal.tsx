"use client";
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {clienteNavegador} from '@/lib/supabase/navegador';
import {guardarFotoReal} from './acciones';
import {aJpeg} from './imagen';

// Foto real de la partida (la que se toma en sucursal) junto a la de Dodo. Se reduce a 1600 px y se sube como JPEG.
const BUCKET='aperturas-fotos';
const MAXIMO=5*1024*1024;

export function FotoReal({proyecto,item,ruta,url,edita}:{proyecto:string;item:string;ruta:string|null;url:string|null;edita:boolean}) {
 const router=useRouter();
 const entrada=useRef<HTMLInputElement>(null);
 const [ocupado,setOcupado]=useState(''),[error,setError]=useState(''),[aviso,setAviso]=useState('');

 const subir=async(archivo:File)=>{
  if(ocupado)return;
  if(!archivo.type.startsWith('image/')){setError('Elige una imagen.');return;}
  if(archivo.size>MAXIMO){setError('La imagen pesa más de 5 MB.');return;}
  setError('');setAviso('');
  const supabase=clienteNavegador();let subida:string|null=null;
  try{
   setOcupado('Preparando…');
   const jpeg=await aJpeg(archivo,1600);
   if(jpeg.size>MAXIMO){setError('La imagen reducida pesa más de 5 MB.');return;}
   const nueva=`${proyecto}/${crypto.randomUUID()}.jpg`;
   setOcupado('Subiendo…');
   const {error:e}=await supabase.storage.from(BUCKET).upload(nueva,jpeg,{contentType:'image/jpeg',upsert:false});
   if(e){setError(`No se pudo subir la foto: ${e.message}`);return;}
   subida=nueva;
   setOcupado('Guardando…');
   let res:Awaited<ReturnType<typeof guardarFotoReal>>;
   try{res=await guardarFotoReal(proyecto,item,nueva);}
   catch{subida=null;setError('No se pudo confirmar si la foto se guardó. Recarga la página.');return;}
   if('error' in res){setError(res.error);return;}
   subida=null;if(res.aviso)setAviso(res.aviso);
   router.refresh();
  }catch(err){
   setError(err instanceof Error&&err.message?`No se pudo preparar la foto: ${err.message}`:'No se pudo preparar la foto.');
  }finally{
   // Lo recién subido que no quedó registrado se borra.
   if(subida)await supabase.storage.from(BUCKET).remove([subida]).then(()=>undefined,()=>undefined);
   setOcupado('');
   if(entrada.current)entrada.current.value='';
  }
 };

 const quitar=async()=>{
  if(ocupado||!window.confirm('¿Quitar la foto real de esta partida?'))return;
  setError('');setAviso('');setOcupado('Quitando…');
  try{
   const res=await guardarFotoReal(proyecto,item,null);
   if('error' in res){setError(res.error);return;}
   if(res.aviso)setAviso(res.aviso);
   router.refresh();
  }catch{setError('No se pudo confirmar si la foto se quitó. Recarga la página.');}
  finally{setOcupado('');}
 };

 return <div className="ap-dodo-foto-real">
  {url?<img src={url} alt="Foto real de la partida" loading="lazy"/>:<p className="ap-nota">{ruta?'No se pudo cargar la foto real.':'Sin foto real.'}</p>}
  {edita&&<>
   <input ref={entrada} type="file" accept="image/*" hidden onChange={e=>{const f=e.currentTarget.files?.[0];if(f)void subir(f);}}/>
   <div className="acciones">
    <button type="button" className="boton boton-secundario" disabled={!!ocupado} onClick={()=>entrada.current?.click()}>{ocupado||(ruta?'Cambiar':'Subir foto real')}</button>
    {ruta&&<button type="button" className="boton boton-secundario" disabled={!!ocupado} onClick={quitar}>Quitar</button>}
   </div>
  </>}
  {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
  {aviso&&<p className="aviso">{aviso}</p>}
 </div>;
}
