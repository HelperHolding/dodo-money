import type { EmpleadoReal } from "./nomina.ts";
import type { Hoja } from "../ventas/xlsx.ts";

export const camposPersonal = ["sueldo", "bono", "imss", "cesantia", "retiro", "impuesto", "infonavit", "ajuste"] as const;
export type DatosPersonal = {nombre:string;puesto:string;renglon:"cocina"|"gerencia";ingreso:string|null;baja:string|null;nota:string;codigo?:string} & Record<typeof camposPersonal[number],number|null>;
export type VersionPersonal = {id:string;desde:string;hasta:string|null;datos:DatosPersonal;sustituida_en?:string|null};
export type Persona = {id:string;codigo:string;sucursal_id:string|null;personal_versiones:VersionPersonal[]};
export type PlantillaPuesto={id:string;sucursal_id:string|null;nombre:string;datos:Pick<DatosPersonal,'puesto'|'renglon'|typeof camposPersonal[number]>;fuente:string;version_fuente:string};
export type EmpleadoBorrador = Omit<EmpleadoReal,typeof camposPersonal[number]> & Record<typeof camposPersonal[number],number|null> & {personal_id:string;version_id:string;codigo?:string};
export type BorradorNomina = {id:string;sucursal_id:string|null;mes:string;fuente:string;empleados:EmpleadoBorrador[];avisos:string[];previa:string|null;confirmada_id:string|null};
const redondear = (n:number) => Math.round(n*100)/100 || 0;
const normal = (s:string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const codigo = (s:string) => /^\d+$/.test(s) ? String(Number(s)) : normal(s);

export function generarPersonal(personas: readonly Persona[], sucursal:string|null, mes:string) {
  const desde=`${mes}-01`, fin=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
  const empleados:EmpleadoBorrador[]=[], avisos:string[]=[];
  for (const p of personas.filter(p=>p.sucursal_id===sucursal)) {
    const versiones=p.personal_versiones.filter(v=>!v.sustituida_en && v.desde<=fin).sort((a,b)=>b.desde.localeCompare(a.desde));
    const v=versiones[0];if(!v)continue;
    const d=v.datos;
    if (d.ingreso && d.ingreso>fin || d.baja && d.baja<desde)continue;
    const parcial=!!(d.ingreso && d.ingreso>desde || d.baja && d.baja<fin || versiones.some(v=>v.desde>desde));
    const vencida=!!(v.hasta && v.hasta<fin);
    const e:EmpleadoBorrador={...d,personal_id:p.id,version_id:v.id};
    for(const k of camposPersonal) e[k]=vencida||parcial?null:d[k];
    if(parcial)avisos.push(`${d.nombre}: hubo ingreso, baja o cambio durante el mes; captura sus importes reales del periodo.`);
    if(vencida)avisos.push(`${d.nombre}: los importes de su perfil ya no están vigentes para ${mes}.`);
    if(camposPersonal.some(k=>e[k]===null))avisos.push(`${d.nombre}: faltan importes; completa el desglose antes de confirmar.`);
    empleados.push(e);
  }
  return {empleados,avisos};
}

export type FilaContpaqi = {codigo:string;nombre:string;sueldo:number;bono:number;imss:number;cesantia:number;retiro:number;impuesto:number;infonavit:number;ajuste:number};
export function extraerContpaqi(h:Hoja,mes:string):FilaContpaqi[] {
  const get=(r:string)=>h.celdas.get(r), text=(r:string)=>String(get(r)??"").trim();
  const fechas=[...text("B4").matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map(m=>`${m[3]}-${m[2]}-${m[1]}`);
  const fin=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
  if(!text("A1").toUpperCase().includes("CONTPAQ") || fechas.length!==2 || fechas[0]!==`${mes}-01` || fechas[1]!==fin)throw new Error("Usa la Lista de Raya tabular de CONTPAQi del mes completo seleccionado.");
  const cols=columnasContpaqi(h);
  if(!cols)throw new Error("El formato de columnas de CONTPAQi no coincide con el acumulado esperado.");
  const num=(col:string,r:number)=>{const n=get(`${col}${r}`);if(typeof n!=="number"||!Number.isFinite(n))throw new Error(`Falta un importe numérico en ${col}${r}.`);return redondear(n);};
  const suma=(lista:string[],r:number)=>redondear(lista.reduce((t,c)=>t+num(c,r),0));
  const ultima=Math.max(0,...[...h.celdas.keys()].map(k=>Number(k.replace(/^[A-Z]+/,""))));
  const filas:FilaContpaqi[]=[];
  for(let r=9;r<=ultima;r++) {
    const cod=text(`A${r}`),nombre=text(`B${r}`);if(!cod||!nombre||typeof get(`${cols.percepciones}${r}`)!=="number"||/^total/i.test(cod))continue;
    const sueldo=num(cols.sueldo,r),bono=redondear(num(cols.percepciones,r)-sueldo);
    const cesantia=num(cols.cesantia,r),retiro=num(cols.retiro,r),impuesto=num(cols.impuesto,r),infonavit=num(cols.infonavit,r);
    // En el acumulado completo, «I.M.S.S. empresa» ya trae cesantía y vejez; riesgo de trabajo y guardería van aparte.
    const imss=redondear(num(cols.imss,r)-(cols.imssIncluyeCesantia?cesantia:0)+suma(cols.imssExtra,r));
    const ajuste=redondear(num(cols.obligaciones,r)-imss-cesantia-retiro-impuesto-infonavit);
    if([sueldo,bono,imss,cesantia,retiro,impuesto,infonavit].some(n=>n<0))throw new Error(`Revisa importes negativos de ${nombre}.`);
    if(filas.some(f=>codigo(f.codigo)===codigo(cod)))throw new Error("El reporte repite un código de empleado.");
    filas.push({codigo:cod,nombre,sueldo,bono,imss,cesantia,retiro,impuesto,infonavit,ajuste});
  }
  if(!filas.length)throw new Error("No se encontraron empleados en el acumulado.");
  const totalFila=Array.from({length:ultima},(_,i)=>i+1).find(r=>/^total\s*gral/i.test(text(`A${r}`)));
  if(!totalFila)throw new Error("Falta el total general del acumulado.");
  const percepciones=redondear(filas.reduce((t,e)=>t+e.sueldo+e.bono,0));
  const obligaciones=redondear(filas.reduce((t,e)=>t+e.imss+e.cesantia+e.retiro+e.impuesto+e.infonavit+e.ajuste,0));
  if(Math.abs(percepciones-num(cols.percepciones,totalFila))>0.01 || Math.abs(obligaciones-num(cols.obligaciones,totalFila))>0.01)throw new Error("El detalle de empleados no cuadra con el total general del acumulado.");
  return filas;
}

type ColumnasContpaqi={sueldo:string;percepciones:string;obligaciones:string;imss:string;cesantia:string;retiro:string;impuesto:string;infonavit:string;imssExtra:string[];imssIncluyeCesantia:boolean};
/** Ubica las columnas por el encabezado de la fila 8; si el reporte no trae todos los conceptos, usa el acumulado corto con columnas fijas. */
function columnasContpaqi(h:Hoja):ColumnasContpaqi|null {
  const encabezados=[...h.celdas].flatMap(([k,v])=>{const m=/^([A-Z]+)8$/.exec(k);return m?[{col:m[1],nombre:normal(String(v??""))}]:[];});
  if(!encabezados.some(e=>e.col==="B"&&e.nombre==="empleado"))return null;
  const buscar=(inicio:string)=>{const hallados=encabezados.filter(e=>e.nombre.startsWith(inicio));return hallados.length===1?hallados[0].col:undefined;};
  const sueldo=buscar("sueldo"),percepciones=buscar("totalpercepciones"),obligaciones=buscar("totalobligaciones"),imss=buscar("imssempresa");
  const cesantia=buscar("cesantiayvejez"),retiro=buscar("2fondoretiro"),impuesto=buscar("2impuestoestatal"),infonavit=buscar("infonavitempresa");
  if(sueldo&&percepciones&&obligaciones&&imss&&cesantia&&retiro&&impuesto&&infonavit)
    return {sueldo,percepciones,obligaciones,imss,cesantia,retiro,impuesto,infonavit,imssExtra:[buscar("riesgodetrabajo"),buscar("guarderia")].filter((c):c is string=>!!c),imssIncluyeCesantia:true};
  const fijo=(col:string,nombre:string)=>encabezados.some(e=>e.col===col&&e.nombre===nombre);
  if(fijo("I","totalpercepciones")&&fijo("AK","totalobligaciones")&&fijo("AG","imssempresa"))
    return {sueldo:"C",percepciones:"I",obligaciones:"AK",imss:"AG",cesantia:"AB",retiro:"AD",impuesto:"AE",infonavit:"AH",imssExtra:[],imssIncluyeCesantia:false};
  return null;
}

export function aplicarContpaqi(personas:readonly Persona[],sucursal:string|null,mes:string,filas:readonly FilaContpaqi[]) {
  const generado=generarPersonal(personas,sucursal,mes);
  const empleados=generado.empleados.map(e=>({...e}));
  const vistos=new Set<string>();
  const diferencias:string[]=[];
  for(const f of filas) {
    const coinciden=empleados.filter(e=>{const p=personas.find(p=>p.id===e.personal_id)!;return codigo(e.codigo??p.codigo)===codigo(f.codigo)&&normal(e.nombre)===normal(f.nombre);});
    if(coinciden.length!==1)throw new Error(`No se pudo vincular ${f.codigo} · ${f.nombre}. Revisa código, nombre y sucursal en Personal.`);
    const e=coinciden[0];if(vistos.has(e.personal_id))throw new Error("El reporte repite un empleado.");vistos.add(e.personal_id);
    if(camposPersonal.every(k=>e[k]!==null)) {
      const esperado=redondear(camposPersonal.reduce((t,k)=>t+Number(e[k]),0)),real=redondear(camposPersonal.reduce((t,k)=>t+f[k],0));
      if(esperado!==real)diferencias.push(`${e.nombre}: costo del perfil ${esperado.toFixed(2)}; costo importado ${real.toFixed(2)}. Revisa la diferencia.`);
    }
    if(f.ajuste!==0)diferencias.push(`${e.nombre}: ajuste de ${f.ajuste.toFixed(2)} para conservar TOTAL OBLIGACIONES del reporte.`);
    for(const k of camposPersonal)e[k]=f[k];
    e.nota=`CONTPAQi: código ${f.codigo}; se conserva el total de obligaciones del reporte. IMSS empresa es un subtotal.`;
  }
  for(const e of empleados)if(!vistos.has(e.personal_id))for(const k of camposPersonal)e[k]=null;
  const avisos=[...diferencias,...empleados.filter(e=>!vistos.has(e.personal_id)).map(e=>`${e.nombre} no aparece en el Excel; captura su desglose real o revisa su fecha de baja en Personal.`)];
  return {empleados,avisos};
}
