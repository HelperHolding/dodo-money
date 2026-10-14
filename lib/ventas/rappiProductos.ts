import type {RappiGuardada,CatalogoRappi} from './rappi';
export type CategoriaRappi='pizza'|'snack'|'postre'|'bebida'|'combo'|'otro'|'sin_categoria';
export const CATEGORIAS_RAPPI:Record<CategoriaRappi,string>={pizza:'Pizzas',snack:'Snacks',postre:'Postres',bebida:'Bebidas',combo:'Combos',otro:'Otros',sin_categoria:'Sin categoría'};
export type ProductoUnidades={clave:string;nombre:string;categoria:CategoriaRappi;unidades:number;ordenes:number;variantes:{nombre:string;unidades:number}[];inferido:boolean};
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
export function categoriaRappi(nombre:string,categoria:string|null):{categoria:CategoriaRappi;inferido:boolean} {
 const n=normal(nombre);
 if(/\bcombo\b|^completo y dulce$|^el de siempre$/.test(n))return {categoria:'combo',inferido:true};
 if(categoria&&['pizza','snack','postre','bebida','otro'].includes(categoria))return {categoria:categoria as CategoriaRappi,inferido:false};
 if(/^pizza\b|^pepperoni$/.test(n))return {categoria:'pizza',inferido:true};
 if(/^dip\b|^papas\b|^boneless\b|^alitas\b/.test(n))return {categoria:'snack',inferido:true};
 if(/^rolls\b|^brownie\b|^galleta\b/.test(n))return {categoria:'postre',inferido:true};
 if(/^coca[ -]cola\b|^ciel\b|^fanta\b|^sprite\b|^agua\b|^fuze\b/.test(n))return {categoria:'bebida',inferido:true};
 return {categoria:'sin_categoria',inferido:true};
}
export function unidadesRappi(ordenes:readonly RappiGuardada[],catalogo:readonly CatalogoRappi[],categorias:readonly {dodo_id:number;categoria:string|null}[]) {
 const cat=new Map(catalogo.map(c=>[Number(c.id),c.dodo_id])),tipos=new Map(categorias.map(c=>[c.dodo_id,c.categoria]));
 const vistos=new Set<string>(),productos=new Map<string,ProductoUnidades & {pedidos:Set<string>;opciones:Map<string,{nombre:string;unidades:number}>}>();
 let cantidadOrdenes=0,enDodo=0;const fechas=new Set<string>();
 for(const o of ordenes){
  const pedido=`${o.sucursal_id}:${o.rappi_id}`;if(vistos.has(pedido)||o.estado!=='Finalizado')continue;vistos.add(pedido);cantidadOrdenes++;if(!o.sumar)enDodo++;
  fechas.add(o.fecha);
  const lineas=new Set<number>();
  for(const p of o.rappi_lineas){if(lineas.has(p.linea))continue;lineas.add(p.linea);
   const unidades=Number(p.cantidad);if(!Number.isFinite(unidades)||unidades<=0)continue;
   const dodo=cat.get(Number(p.producto_id)),clasificacion=categoriaRappi(p.nombre,dodo===null||dodo===undefined?null:tipos.get(dodo)??null);
   const clave=JSON.stringify([clasificacion.categoria,normal(p.nombre)]);
   const fila=productos.get(clave)??{clave,nombre:p.nombre,categoria:clasificacion.categoria,unidades:0,ordenes:0,variantes:[],inferido:false,pedidos:new Set<string>(),opciones:new Map()};
   fila.unidades+=unidades;fila.pedidos.add(pedido);fila.inferido ||= clasificacion.inferido;
   const opcion=normal(p.opciones),v=fila.opciones.get(opcion)??{nombre:p.opciones||'Sin opciones',unidades:0};v.unidades+=unidades;fila.opciones.set(opcion,v);productos.set(clave,fila);
  }
 }
 const filas:ProductoUnidades[]=[...productos.values()].map(p=>({clave:p.clave,nombre:p.nombre,categoria:p.categoria,unidades:p.unidades,ordenes:p.pedidos.size,inferido:p.inferido,variantes:[...p.opciones.values()].sort((a,b)=>b.unidades-a.unidades||a.nombre.localeCompare(b.nombre,'es'))})).sort((a,b)=>b.unidades-a.unidades||a.nombre.localeCompare(b.nombre,'es'));
 const grupos=Object.entries(CATEGORIAS_RAPPI).map(([categoria,nombre])=>({categoria:categoria as CategoriaRappi,nombre,unidades:filas.filter(p=>p.categoria===categoria).reduce((s,p)=>s+p.unidades,0)})).filter(g=>g.unidades>0);
 const dias=[...fechas].sort();
 return {filas,grupos,unidades:filas.reduce((s,p)=>s+p.unidades,0),ordenes:cantidadOrdenes,enDodo,desde:dias[0]??null,hasta:dias[dias.length-1]??null};
}
