import type { Celda, EstiloFila, HojaXlsx } from '../xlsx-escribir';
import type { FilaCuenta } from '../../app/finanzas/cuentasDatos';
import type { GrupoCuenta } from './reporteCuentas';

type Columna = { etiqueta:string; desde:string; hasta:string };
type Reporte = { titulo:string; generado:string; columnas:Columna[]; filas:FilaCuenta[]; avisos:readonly string[] };
const centavos=(n:number)=>Math.round(n*100)/100;
const oscuro:EstiloFila={fondo:'243044',texto:'FFFFFF',negrita:true,ajustarTexto:true};
const cabecera:EstiloFila={fondo:'E7EDF5',negrita:true,ajustarTexto:true};
const normal:EstiloFila={ajustarTexto:true};
const enlace:EstiloFila={texto:'2459A6'};
const moneda=(valor:number):Celda=>({valor,formato:'contable'});
const formula=(f:string,n:number,destino?:string):Celda=>({formula:f,resultado:n,formato:'contable',...(destino?{enlaceInterno:destino,estilo:enlace}:{})});
const letra=(i:number)=>{let s='';for(let n=i+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const textoFormula=(s:string)=>s.replace(/"/g,'""');
const ligaDocumento=(href?:string):Celda=>{
  if(!href?.startsWith('/')||href.startsWith('//'))return null;
  const url=new URL(href,'https://dodo-money-j31t.vercel.app');
  if(url.origin!=='https://dodo-money-j31t.vercel.app')return null;
  return {formula:`HYPERLINK("${textoFormula(url.href)}","Abrir documento en Dodo MX")`,resultado:'Abrir documento en Dodo MX',estilo:enlace};
};

/** Mismas celdas y aportaciones devengadas que la tabla. Cada bloque respalda un importe,
 * incluidos los totales con signos: esos bloques NO son un segundo libro de movimientos. */
export function hojasCuentas(r:Reporte):HojaXlsx[]{
  const finCol=letra(r.columnas.length+2);
  const rango=r.columnas.length?`${r.columnas[0].desde} al ${r.columnas.at(-1)!.hasta}`:'Sin días cerrados';
  const resumen:HojaXlsx={nombre:'Por cuentas',filas:[
    [`P&L por cuentas · ${r.titulo}`],[`${rango}. MXN sin IVA, después de descuentos. Criterio devengado.`],
    [`Generado por ${r.generado}`],['Haz clic en un importe para ver su respaldo. Insumos e inversiones son memo, fuera del resultado.'],
    ['Cuenta / concepto','Código de cuenta',...r.columnas.map(c=>`${c.etiqueta}\n${c.desde} al ${c.hasta}`),'Acumulado'],
  ],anchos:[52,22,...r.columnas.map(()=>23),23],estilos:{0:oscuro,1:normal,2:normal,3:normal,4:cabecera},
    combinadas:[`A1:${finCol}1`,`A2:${finCol}2`,`A3:${finCol}3`,`A4:${finCol}4`],altos:{0:30,1:30,2:24,3:34,4:44},inmovilizar:5,ocultarCuadricula:true};
  const detalle:HojaXlsx={nombre:'Detalle',filas:[
    [`Detalle del P&L · ${r.titulo}`],[rango],
    ['Cada bloque respalda un importe del P&L. Los documentos reaparecen en subtotales, acumulados y resultados: no sumar bloques entre sí.'],
    ['Aportaciones devengadas sin IVA; las notas de crédito restan. Los bloques de resultado muestran ingresos positivos y costos negativos.'],
    ['Renglón del P&L','Cuenta / estado','Código','Periodo','Desde','Hasta','Fecha documento','Documento / concepto','Proveedor','RFC razón social','UUID','Aportación al P&L','Cobertura / cálculo','Documento en Dodo MX'],
  ],anchos:[36,36,19,24,14,14,16,55,40,22,40,22,65,30],estilos:{0:oscuro,1:normal,2:normal,3:normal,4:cabecera},
    combinadas:['A1:N1','A2:N2','A3:N3','A4:N4'],altos:{0:30,1:24,2:34,3:34,4:34},inmovilizar:5,ocultarCuadricula:true};

  // Registro de rangos por celda y cuenta: el resumen suma el detalle sin duplicar los bloques de totales.
  type Ref={primero:number;ultimo:number};
  const refs=new Map<string,Ref>();
  const key=(fila:string,i:number,grupo?:string)=>JSON.stringify([fila,i,grupo??null]);
  const indiceAcumulado=r.columnas.length>1?r.columnas.length:0;
  const periodos=[...r.columnas,{etiqueta:'Acumulado',desde:r.columnas[0]?.desde??'',hasta:r.columnas.at(-1)?.hasta??''}];
  for(const f of r.filas){
    const grupos=new Map<string,GrupoCuenta>();
    for(const [i,c] of f.celdas.entries())for(const g of c.grupos){
      const previo=grupos.get(g.id)??{...g,monto:0,items:[]};
      previo.monto=centavos(previo.monto+g.monto);
      previo.items.push(...g.items.map(item=>({...item,nota:`${r.columnas[i].etiqueta} (${r.columnas[i].desde} al ${r.columnas[i].hasta})${item.nota?` · ${item.nota}`:''}`})));
      grupos.set(g.id,previo);
    }
    const monto=f.celdas.some(c=>c.monto===null)?null:centavos(f.celdas.reduce((s,c)=>s+(c.monto??0),0));
    const celdas=r.columnas.length>1?[...f.celdas,{monto,grupos:[...grupos.values()]}]:f.celdas;
    for(const [i,c] of celdas.entries()){
    if(c.monto===null||!c.grupos.length)continue;
    const primero=detalle.filas.length+1;
    for(const g of c.grupos){
      const inicio=detalle.filas.length+1;
      for(const item of g.items){
        const n=detalle.filas.length;
        detalle.filas.push([f.nombre,g.nombre,g.codigo??g.estado,periodos[i].etiqueta,
          {fecha:periodos[i].desde},{fecha:periodos[i].hasta},item.fecha?{fecha:item.fecha}:null,
          item.texto,item.proveedor??null,item.rfc??null,item.uuid??null,moneda(item.monto),item.nota??null,ligaDocumento(item.href)]);
        detalle.estilos![n]=normal;
        detalle.altos![n]=Math.max(44,Math.ceil(item.texto.length/50)*15,Math.ceil((item.nota?.length??0)/62)*15);
      }
      if(detalle.filas.length>=inicio)refs.set(key(f.clave,i,g.id),{primero:inicio,ultimo:detalle.filas.length});
    }
    if(detalle.filas.length>=primero)refs.set(key(f.clave,i),{primero,ultimo:detalle.filas.length});
    }
  }
  const celda=(f:FilaCuenta,i:number,g?:GrupoCuenta):Celda=>{
    const c=f.celdas[i],monto=g?(c.grupos.find(x=>x.id===g.id)?.monto??0):c.monto;
    if(monto===null)return 'Sin dato';
    const ref=refs.get(key(f.clave,i,g?.id));
    return ref?formula(`ROUND(SUM('Detalle'!L${ref.primero}:L${ref.ultimo}),2)`,monto,`'Detalle'!A${ref.primero}`):moneda(monto);
  };
  for(const f of r.filas){
    const n=resumen.filas.length+1;
    const total=f.celdas.some(c=>c.monto===null)?null:centavos(f.celdas.reduce((s,c)=>s+(c.monto??0),0));
    const acumulado=(valor:number|null,grupo?:string):Celda=>valor===null?'Sin dato':formula(
      `ROUND(SUM(C${resumen.filas.length+1}:${letra(r.columnas.length+1)}${resumen.filas.length+1}),2)`,valor,
      refs.has(key(f.clave,indiceAcumulado,grupo))?`'Detalle'!A${refs.get(key(f.clave,indiceAcumulado,grupo))!.primero}`:undefined);
    resumen.filas.push([f.nombre,f.tipo==='total'?'Total':f.tipo==='memo'?'Memo':'Subtotal',...f.celdas.map((_,i)=>celda(f,i)),
      r.columnas.length?acumulado(total):'Sin dato']);
    resumen.estilos![n-1]=f.tipo==='total'?{...cabecera,fondo:'D2DFEF'}:cabecera;resumen.altos![n-1]=34;
    if(f.tipo==='total')continue;
    const grupos=[...new Map(f.celdas.flatMap(c=>c.grupos.map(g=>[g.id,g] as const))).values()]
      .sort((a,b)=>(a.codigo??'z').localeCompare(b.codigo??'z')||a.nombre.localeCompare(b.nombre));
    for(const g of grupos){
      const num=resumen.filas.length+1;
      const monto=centavos(f.celdas.reduce((s,c)=>s+(c.grupos.find(x=>x.id===g.id)?.monto??0),0));
      resumen.filas.push([`    ${g.nombre}`,g.codigo??g.estado,...f.celdas.map((_,i)=>celda(f,i,g)),acumulado(monto,g.id)]);
      resumen.estilos![num-1]=normal;resumen.altos![num-1]=34;
    }
  }
  if(!r.columnas.length){resumen.filas.push(['Todavía no hay días cerrados para este periodo.']);detalle.filas.push(['Sin aportaciones en este periodo.']);}
  if(r.avisos.length){
    resumen.filas.push([],['Observaciones del reporte']);resumen.estilos![resumen.filas.length-1]=cabecera;
    for(const aviso of r.avisos){resumen.filas.push([aviso]);resumen.combinadas!.push(`A${resumen.filas.length}:${finCol}${resumen.filas.length}`);resumen.altos![resumen.filas.length-1]=Math.max(32,Math.ceil(aviso.length/100)*15);resumen.estilos![resumen.filas.length-1]=normal;}
  }
  resumen.impresion={area:`$A$1:$${finCol}$${resumen.filas.length}`,repetirFilas:'$1:$5'};
  detalle.impresion={area:`$A$1:$N$${detalle.filas.length}`,repetirFilas:'$1:$5'};
  return [resumen,detalle];
}
