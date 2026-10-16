// @ts-expect-error Node strip-types requiere extensión explícita.
import {buscarAproximado} from '../busquedaAproximada.ts';
type ProveedorBuscable={razon_social:string;nombre_comercial:string|null;rfc:string};
export function buscarProveedores<T extends ProveedorBuscable>(filas:readonly T[],consulta:string):T[]{
 return buscarAproximado(filas,consulta,f=>({nombres:[f.razon_social,f.nombre_comercial??''],codigos:[f.rfc]}));
}
