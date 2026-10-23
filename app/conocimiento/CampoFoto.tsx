'use client';
import {useState} from 'react';
const LADO_MAX=1600;
/** Las fotos del celular suelen pesar más de 4 MB o venir en HEIC: se reducen a JPG en el navegador antes de enviarse. */
async function reducir(archivo:File):Promise<File> {
 if(archivo.size<=1.5*1024*1024&&/^image\/(jpeg|png|webp)$/.test(archivo.type))return archivo;
 const imagen=await createImageBitmap(archivo);
 const escala=Math.min(1,LADO_MAX/Math.max(imagen.width,imagen.height));
 const lienzo=document.createElement('canvas');lienzo.width=Math.round(imagen.width*escala);lienzo.height=Math.round(imagen.height*escala);
 lienzo.getContext('2d')!.drawImage(imagen,0,0,lienzo.width,lienzo.height);imagen.close();
 const blob=await new Promise<Blob|null>(ok=>lienzo.toBlob(ok,'image/jpeg',0.85));
 if(!blob)return archivo;
 return new File([blob],archivo.name.replace(/\.[^.]*$/,'')+'.jpg',{type:'image/jpeg'});
}
export function CampoFoto() {
 const [nota,setNota]=useState('');
 return <label className="campo">Foto<input type="file" name="foto" required accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={async e=>{
  const input=e.currentTarget,original=input.files?.[0];if(!original)return setNota('');
  try {
   const lista=new DataTransfer();const final=await reducir(original);lista.items.add(final);input.files=lista.files;
   setNota(final===original?'':`Reducida de ${(original.size/1048576).toFixed(1)} MB a ${(final.size/1048576).toFixed(1)} MB.`);
  } catch {setNota('No se pudo preparar la foto en este navegador; se enviará como está.');}
 }}/>{nota&&<small>{nota}</small>}</label>;
}
