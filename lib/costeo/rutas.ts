/** Algunas navegaciones entregan el segmento aún codificado. Conserva primero las claves literales. */
export function buscarPorRuta<T>(items:readonly T[],segmento:string,clave:(item:T)=>string):T|undefined {
 const literal=items.find(i=>clave(i)===segmento);
 if(literal)return literal;
 try {const decodificado=decodeURIComponent(segmento);return items.find(i=>clave(i)===decodificado);}catch{return undefined;}
}
