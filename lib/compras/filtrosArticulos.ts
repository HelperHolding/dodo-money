// @ts-expect-error Node strip-types requiere extensión explícita.
import {buscarAproximado} from '../busquedaAproximada.ts';
export type IndiceArticulo={id:string;texto:string;tipo:string;iva:string;proveedores:string[]};
export type FiltrosArticulos={q:string;proveedor:string;tipo:string;iva:string};
export const FILTROS_ARTICULOS_VACIOS:FiltrosArticulos={q:'',proveedor:'',tipo:'',iva:''};
export function filtrarArticulos(indice:readonly IndiceArticulo[],f:FiltrosArticulos) {
 const base=indice.filter(a=>(!f.tipo||a.tipo===f.tipo)&&(!f.iva||a.iva===f.iva)&&(!f.proveedor||(f.proveedor==='sin-proveedor'?a.proveedores.length===0:a.proveedores.includes(f.proveedor))));
 return buscarAproximado(base,f.q,a=>({nombres:[a.texto]}));
}
