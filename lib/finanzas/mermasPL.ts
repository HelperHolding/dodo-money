import type { MermaDodo, DiaMerma } from "./mermasDodo";
export type CostoMerma = { id:string; orden:number; sucursal_id:string; clave:string; vigente_desde:string; costo_unitario:number; fuente:string; registrado_en:string; anulado_en:string|null };
export type MermaValorada = MermaDodo & { costo_pl:number|null; fuente_costo:string; costo_manual:boolean };
const redondear=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

/** Los costos explícitos sin IVA tienen vigencia; las bajas originales permanecen intactas. */
export function valorarMermas(filas:readonly MermaDodo[],costos:readonly CostoMerma[]):MermaValorada[] {
 const porClave=new Map<string,CostoMerma[]>();
 for(const c of costos.filter(c=>!c.anulado_en)) {const k=`${c.sucursal_id}|${c.clave}`;porClave.set(k,[...(porClave.get(k)??[]),c]);}
 for(const lista of porClave.values())lista.sort((a,b)=>b.vigente_desde.localeCompare(a.vigente_desde)||Number(b.orden)-Number(a.orden));
 return filas.map(r=>{
  const c=r.tipo==="producto"?porClave.get(`${r.sucursal_id}|${r.clave}`)?.find(c=>c.vigente_desde<=r.fecha):undefined;
  const monto=c?redondear(Number(r.cantidad)*Number(c.costo_unitario)):Number(r.costo);
  const valido=Number.isFinite(monto)&&monto>=0&&monto<1e12&&(!!c||!r.sin_costo);
  return {...r,costo_pl:valido?monto:null,fuente_costo:c?`${c.fuente} · ${c.costo_unitario} por pieza, vigente ${c.vigente_desde}`:"Dodo IS · reporte sin IVA",costo_manual:!!c};
 });
}

/** Bajas de productos e insumos adicionales al BOM, separadas y solo con costo conocido. */
export function mermaParaPL(filas:readonly MermaValorada[],dias:readonly DiaMerma[],desde:string,hasta:string) {
 const dentro=(f:string)=>f>=desde&&f<=hasta;
 const productos=filas.filter(r=>r.tipo==="producto"&&dentro(r.fecha));
 const insumosFilas=filas.filter(r=>r.tipo==="insumo"&&dentro(r.fecha));
 const fechas=new Set(dias.filter(d=>dentro(d.fecha)).map(d=>d.fecha));
 const completos=new Set(dias.filter(d=>dentro(d.fecha)&&d.productos_completos).map(d=>d.fecha));
 const esperados=desde<=hasta?Math.floor((Date.parse(`${hasta}T00:00:00Z`)-Date.parse(`${desde}T00:00:00Z`))/86400000)+1:0;
 const sinImportar=Math.max(0,esperados-fechas.size),sinCobertura=Math.max(0,fechas.size-completos.size);
 const sinCosto=productos.filter(r=>r.costo_pl===null).length,conCosto=productos.filter(r=>r.costo_pl!==null);
 const suma=redondear(conCosto.reduce((t,r)=>t+Number(r.costo_pl),0));
 const conProductos=new Set(productos.map(r=>r.fecha));
 const hayDiaVacioCompleto=[...completos].some(f=>!conProductos.has(f));
 const insumosConCosto=insumosFilas.filter(r=>r.costo_pl!==null),sinCostoInsumos=insumosFilas.length-insumosConCosto.length;
 const diasConInsumos=new Set(insumosFilas.map(r=>r.fecha));
 const insumosMonto=insumosConCosto.length||[...fechas].some(f=>!diasConInsumos.has(f))?redondear(insumosConCosto.reduce((t,r)=>t+Number(r.costo_pl),0)):null;
 return { monto:conCosto.length||hayDiaVacioCompleto?suma:null,parcial:sinImportar>0||sinCobertura>0||sinCosto>0,sinImportar,sinCobertura,sinCosto,
  insumos:insumosFilas.length,insumosFilas,insumosMonto,sinCostoInsumos,insumosParcial:sinImportar>0||sinCostoInsumos>0,productos,completos:completos.size };
}
