/** Precio POS de lista desde las ventas de Dodo IS: el precio sin descuento del cobro más reciente en tienda, por producto. Puro, sin red. */
export type LineaPrecioPOS={dodo_id:number;precio_sin_descuento:number;pedidos:{fecha:string;hora:string;agregador:string|null;tipo:string;estado:string}};
export function ultimosPreciosPOS(lineas:readonly LineaPrecioPOS[],hoy:string){
 const resultado=new Map<number,{precio:number;fecha:string}>();
 // Rappi (agregador) tiene su propia lista; la comida de personal y los cancelados no son precio de venta.
 const validas=lineas.filter(l=>!l.pedidos.agregador&&l.pedidos.tipo!=="personal"&&l.pedidos.estado==="entregado"&&l.pedidos.fecha<=hoy&&Number(l.precio_sin_descuento)>0);
 for(const l of validas.sort((a,b)=>b.pedidos.fecha.localeCompare(a.pedidos.fecha)||b.pedidos.hora.localeCompare(a.pedidos.hora)))
  if(!resultado.has(l.dodo_id))resultado.set(l.dodo_id,{precio:Number(l.precio_sin_descuento),fecha:l.pedidos.fecha});
 return resultado;
}
