export type Articulo = {id:string;slug:string;titulo:string;categoria:string;contenido:string;roles:string[];publicado:boolean;revision:number;actualizado_en:string};
export type Pregunta = {id:string;titulo:string;contenido:string;respuesta:string|null;revision:number;creado_en:string;respondido_en:string|null};
export type FotoManual = {id:string;nombre:string;descripcion:string;creado_en:string};
export const PUESTOS = {operacion:'Operación',encargado:'Encargado',gerente:'Gerente',admin:'Administración',corporativo:'Corporativo'};
export function buscarManuales(articulos:Articulo[],q:string,categoria?:string) {
 const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const palabras=normal(q).split(/\s+/).filter(Boolean);
 return articulos.filter(a=>(!categoria||a.categoria===categoria)&&palabras.every(p=>normal(`${a.titulo} ${a.contenido}`).includes(p)));
}
