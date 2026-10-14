export const MAX_ADJUNTO=4*1024*1024;
const tipos:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
export function validarAdjunto(nombre:string,bytes:Uint8Array) {
  const limpio=nombre.trim();
  if(!limpio||limpio.length>200||/[\x00-\x1f\x7f/\\]/.test(limpio))throw Error('Nombre de archivo inválido.');
  if(!bytes.length||bytes.length>MAX_ADJUNTO)throw Error('El archivo debe pesar como máximo 4 MB y no estar vacío.');
  const extension=limpio.split('.').at(-1)?.toLowerCase()??'',mime=tipos[extension];
  if(!mime)throw Error('Usa PDF, JPG, PNG, WebP, XLSX o DOCX.');
  const inicia=(sig:number[])=>sig.every((v,i)=>bytes[i]===v);
  const ascii=(desde:number,hasta:number)=>String.fromCharCode(...bytes.slice(desde,hasta));
  let valido=extension==='pdf'?ascii(0,5)==='%PDF-':extension==='jpg'||extension==='jpeg'?inicia([255,216,255]):extension==='png'?inicia([137,80,78,71,13,10,26,10]):extension==='webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':inicia([80,75,3,4]);
  if(extension==='xlsx'||extension==='docx') {
    // Solo identifica el contenedor Office; no ejecuta macros ni descomprime archivos.
    const texto=new TextDecoder('latin1').decode(bytes);
    valido=valido&&texto.includes('[Content_Types].xml')&&texto.includes(extension==='xlsx'?'xl/workbook.xml':'word/document.xml');
  }
  if(!valido)throw Error('El contenido no coincide con el formato del archivo.');
  return {nombre:limpio,extension:extension==='jpeg'?'jpg':extension,mime};
}
