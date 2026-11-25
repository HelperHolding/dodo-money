"use client";

/** Reduce la imagen a `lado` px de lado mayor como máximo y la exporta como JPEG 0.85. Falla si el navegador no la puede leer (p. ej. emf/wmf). */
export async function aJpeg(imagen:Blob,lado:number):Promise<Blob> {
 const bmp=await createImageBitmap(imagen);
 try{
  const escala=Math.min(1,lado/Math.max(bmp.width,bmp.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bmp.width*escala));canvas.height=Math.max(1,Math.round(bmp.height*escala));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('El navegador no permite dibujar la imagen.');
  // Fondo blanco: el JPEG no tiene transparencia y los PNG quedarían en negro.
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/jpeg',0.85));
  if(!blob)throw new Error('No se pudo convertir la imagen.');
  return blob;
 }finally{bmp.close();}
}
