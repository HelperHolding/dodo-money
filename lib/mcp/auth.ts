import {createHash,timingSafeEqual} from 'node:crypto';

// Compara hashes de igual longitud para no filtrar por tiempo ni la longitud de la llave.
const huella=(s:string)=>createHash('sha256').update(s,'utf8').digest();
export function llaveValida(autorizacion:string|null,esperada:string):boolean {
 if(!esperada||!autorizacion)return false;
 const m=/^Bearer\s+(\S+)$/i.exec(autorizacion.trim());
 if(!m)return false;
 return timingSafeEqual(huella(m[1]),huella(esperada));
}
