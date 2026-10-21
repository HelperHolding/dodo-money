/** Suma de un combo: costo y precio de referencia del canal; null si a un producto le falta el dato (no se inventa cero). */
export type LineaCombo={costo:number|null;precio:number|null;cantidad:number};
export function resumirCombo(lineas:readonly LineaCombo[]){
 const validas=lineas.length>0&&lineas.every(l=>Number.isInteger(l.cantidad)&&l.cantidad>0);
 if(!validas)return {costo:null,precio:null,piezas:0};
 const suma=(campo:"costo"|"precio")=>lineas.some(l=>l[campo]===null||!Number.isFinite(l[campo])||Number(l[campo])<0||(campo==="precio"&&l[campo]===0))?null:Math.round(lineas.reduce((s,l)=>s+Number(l[campo])*l.cantidad,0)*10000)/10000;
 return {costo:suma("costo"),precio:suma("precio"),piezas:lineas.reduce((s,l)=>s+l.cantidad,0)};
}
