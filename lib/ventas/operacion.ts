export type DiaOperacion={fecha:string;datos:Record<string,number|null>};
const columnas:Record<string,string>={'Orders':'pedidos','Average DineIn+Takeaway Cooking Time':'preparacion_ms','DineIn Orders with Cooking Time >0':'pedidos_preparados','Orders with Cooking Time >=15 min':'demorados','Average Queue Time':'cola_ms','Kitchen Working Hours':'horas','Productivity Product Count':'productos','Kitchen Productivity, Products per Hour':'productividad','Product stops':'paradas_producto','Stops of ingredients':'paradas_insumo','Store Stop Duration':'parada_tienda_ms','Share of Orders with Queue Time >= 2 min':'cola_larga'};
export function leerCsvOperacion(csv:string,hoy:string):DiaOperacion[]{
 const registros:string[][]=[];let fila:string[]=[],valor='',comillas=false;
 const texto=csv.replace(/^\uFEFF/,'');
 for(let i=0;i<texto.length;i++){const c=texto[i];if(c==='"'){if(comillas&&texto[i+1]==='"'){valor+='"';i++;}else comillas=!comillas;}else if(!comillas&&(c===';'||c==='\n')){fila.push(valor.replace(/\r$/,''));valor='';if(c==='\n'){if(fila.some(Boolean))registros.push(fila);fila=[];}}else valor+=c;}
 if(comillas)throw Error('CSV incompleto.');if(valor||fila.length){fila.push(valor.replace(/\r$/,''));if(fila.some(Boolean))registros.push(fila);}
 const cab=registros.shift()??[];if(cab[0]!=='Period'||Object.keys(columnas).some(c=>!cab.includes(c)))throw Error('Exporta Unit Summary de Operational metrics en CSV, con Time Grain Day.');
 const ids=new Set<string>();const resultado=registros.map(r=>{
 if(r.length!==cab.length)throw Error('Las columnas del CSV no coinciden.');const fecha=r[0];if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha||fecha<'2020-01-01'||fecha>hoy)throw Error('Fecha inválida: '+fecha);if(ids.has(fecha))throw Error('Hay más de una fila por día; exporta una sola sucursal.');ids.add(fecha);
 const datos:Record<string,number|null>={};for(const [col,key]of Object.entries(columnas)){const raw=r[cab.indexOf(col)].trim();if(!raw||raw==='N/A'||raw==='NaN'){datos[key]=null;continue;}const n=Number(raw);if(!Number.isFinite(n)||n<0||n>1e12||(key==='cola_larga'&&n>1))throw Error('Valor inválido en '+col);if(['pedidos','pedidos_preparados','demorados','productos','paradas_producto','paradas_insumo'].includes(key)&&!Number.isInteger(n))throw Error('Cantidad inválida en '+col);datos[key]=n;}
 if(datos.pedidos===null||datos.pedidos_preparados===null||datos.demorados===null||datos.demorados>datos.pedidos)throw Error('Faltan pedidos o los demorados no cuadran.');
 // Analytics devuelve duraciones numéricas en milisegundos. Cero horas no prueba productividad cero.
 if(!datos.horas)datos.productividad=null;
 return {fecha,datos};});
 if(!resultado.length||resultado.length>366)throw Error('El archivo debe incluir entre 1 y 366 días.');return resultado.sort((a,b)=>a.fecha.localeCompare(b.fecha));
}
export function resumenOperacion(dias:DiaOperacion[]){
 const suma=(k:string)=>dias.reduce((s,d)=>s+(d.datos[k]??0),0);const media=(k:string,peso:string)=>{const validos=dias.filter(d=>d.datos[k]!==null&&(d.datos[peso]??0)>0);const n=validos.reduce((s,d)=>s+d.datos[peso]!,0);return n?validos.reduce((s,d)=>s+d.datos[k]!*d.datos[peso]!,0)/n:null;};
 const pedidos=suma('pedidos');const horas=suma('horas');const coberturaHoras=dias.filter(d=>(d.datos.horas??0)>0).length;
 return {pedidos,demorados:suma('demorados'),porcentajeDemorados:pedidos?suma('demorados')/pedidos:null,preparacion:media('preparacion_ms','pedidos_preparados'),cola:media('cola_ms','pedidos'),horas,productividad:coberturaHoras===dias.length&&horas>0?suma('productos')/horas:null,coberturaHoras,paradasProducto:suma('paradas_producto'),paradasInsumo:suma('paradas_insumo')};
}
