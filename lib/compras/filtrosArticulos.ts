export type IndiceArticulo={id:string;texto:string;tipo:string;iva:string;proveedores:string[]};
export type FiltrosArticulos={q:string;proveedor:string;tipo:string;iva:string};
export const FILTROS_ARTICULOS_VACIOS:FiltrosArticulos={q:'',proveedor:'',tipo:'',iva:''};
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filtrarArticulos(indice:readonly IndiceArticulo[],f:FiltrosArticulos) {
 const palabras=normal(f.q).trim().split(/\s+/).filter(Boolean);
 return indice.filter(a=>palabras.every(p=>normal(a.texto).includes(p))&&(!f.tipo||a.tipo===f.tipo)&&(!f.iva||a.iva===f.iva)&&(!f.proveedor||(f.proveedor==='sin-proveedor'?a.proveedores.length===0:a.proveedores.includes(f.proveedor))));
}
