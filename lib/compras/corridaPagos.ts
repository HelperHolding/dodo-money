import type {Celda,HojaXlsx,EstiloFila} from '../xlsx-escribir';
export type FacturaCorrida={
 id:string;uuid:string|null;proveedor_id:string;proveedor:string;nombre:string;rfc_receptor:string;empresa:string;empresaActiva:boolean;
 sucursal_id:string|null;fecha_emision:string;vence_el:string;pago_programado_el:string|null;pago_sugerido_el?:string|null;
 fechaPago:string;formaPrevista:string|null;estado:string;tipo:string;saldo:number;total:number;origen:string;falta_complemento:boolean;conceptos:string[];
};
export type LigaCorrida={factura_id:string;sucursal_id:string|null};
export type FiltroCorrida={desde:string;hasta:string;fecha:string;proveedor?:string;sucursal?:string;complemento?:string};
export type LineaCorrida=FacturaCorrida&{fechaPago:string;destino:string;destinoId:string;sinDistribuir:boolean;advertencias:string[]};
const centavos=(n:number)=>Math.round(Number(n)*100);
const total=(filas:readonly {saldo:number}[])=>filas.reduce((n,f)=>n+centavos(f.saldo),0)/100;
const totalOriginal=(filas:readonly {total:number}[])=>filas.reduce((n,f)=>n+centavos(f.total),0)/100;
const fechaValida=(f:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(f)&&!Number.isNaN(Date.parse(f+'T00:00:00Z'))&&new Date(f+'T00:00:00Z').toISOString().slice(0,10)===f;
export function validarFiltroCorrida(f:FiltroCorrida):string|null{
 if(![f.desde,f.hasta,f.fecha].every(fechaValida))return 'Elige fechas válidas para la corrida.';
 if(f.desde>f.hasta||Date.parse(f.hasta)-Date.parse(f.desde)>365*86400000)return 'El rango debe estar ordenado y ser de hasta 366 días.';
 return null;
}
/** Misma selección por fecha efectiva y sucursal que el calendario. Una factura se cuenta una sola vez. */
export function seleccionarCorrida(facturas:readonly FacturaCorrida[],ligas:readonly LigaCorrida[],sucursales:ReadonlyMap<string,string>,filtro:FiltroCorrida):LineaCorrida[]{
 const destinos=new Map<string,Set<string>>();
 for(const l of ligas){const s=destinos.get(l.factura_id)??new Set<string>();s.add(l.sucursal_id??'oficina');destinos.set(l.factura_id,s);}
 const usados=new Set<string>(),filas:LineaCorrida[]=[];
 for(const f of facturas){
  if(usados.has(f.id))continue;usados.add(f.id);
  const fechaPago=f.fechaPago,sedes=destinos.get(f.id)??new Set([f.sucursal_id??'oficina']);
  if(f.tipo!=='ingreso'||!['por_pagar','parcial'].includes(f.estado)||!(Number(f.saldo)>0)||fechaPago<filtro.desde||fechaPago>filtro.hasta||filtro.proveedor&&f.proveedor_id!==filtro.proveedor||filtro.sucursal&&!sedes.has(filtro.sucursal)||filtro.complemento==='si'&&!f.falta_complemento)continue;
  if(!Number.isFinite(Number(f.saldo))||!Number.isFinite(Number(f.total)))throw Error('Hay importes no válidos en la corrida.');
  const sinDistribuir=sedes.size>1,destinoId=sinDistribuir?'sin_distribuir':[...sedes][0];
  const destino=sinDistribuir?[...sedes].map(s=>s==='oficina'?'Oficina':sucursales.get(s)??s).sort().join(', '):destinoId==='oficina'?'Oficina':sucursales.get(destinoId)??destinoId;
  const advertencias:string[]=[];
  if(sinDistribuir)advertencias.push('La factura cubre varias sucursales y no tiene distribución de saldo por sucursal. No se incluyó en la corrida para evitar duplicarla.');
  if(!f.formaPrevista)advertencias.push('Falta definir la forma de pago prevista.');
  if(f.origen==='manual')advertencias.push(f.uuid?'UUID capturado manualmente; XML pendiente.':'Documento sin CFDI.');
  if(f.falta_complemento)advertencias.push('Complemento de pago pendiente.');
  if(!f.empresaActiva)advertencias.push('RFC receptor histórico o razón social inactiva: revisar antes de pagar.');
  filas.push({...f,saldo:centavos(f.saldo)/100,total:centavos(f.total)/100,fechaPago,destino,destinoId,sinDistribuir,advertencias});
 }
 return filas.sort((a,b)=>a.destino.localeCompare(b.destino,'es')||a.empresa.localeCompare(b.empresa,'es')||a.proveedor.localeCompare(b.proveedor,'es')||a.fechaPago.localeCompare(b.fechaPago)||a.id.localeCompare(b.id));
}
const oscuro:EstiloFila={fuente:'Arial',tamano:10,fondo:'1A1A1A',texto:'FFFFFF',negrita:true,ajustarTexto:true};
const cabecera:EstiloFila={...oscuro,fondo:'2C3E50',tamano:9};
const grupo:EstiloFila={fuente:'Arial',tamano:9,fondo:'F2F2F2',negrita:true,ajustarTexto:true};
const normal:EstiloFila={fuente:'Arial',tamano:9,ajustarTexto:true};
const editable:EstiloFila={fondo:'FFF2CC',texto:'0000FF'};
const moneda=(valor:number):Celda=>({valor,formato:'pesos'});
const formula=(formula:string,resultado:number|string,formato:'pesos'|'general'='pesos'):Celda=>({formula,resultado,formato});
export function urlCalendarioCorrida(f:FiltroCorrida){
 const q=new URLSearchParams({desde:f.desde,hasta:f.hasta});
 for(const k of ['proveedor','sucursal','complemento'] as const)if(f[k])q.set(k,f[k]!);
 return `https://dodo-money-j31t.vercel.app/compras/pagos?${q}`;
}
const refHoja=(nombre:string)=>`'${nombre.replace(/'/g,"''")}'`;
/** Nombres únicos, válidos en Excel y ajenos a las hojas reservadas. */
export function nombresCorrida(destinos:readonly {id:string;nombre:string}[]):Map<string,string>{
 const usados=new Set(['resumen','pendientes de revisión']),nombres=new Map<string,string>();
 for(const s of destinos){const base=s.nombre.replace(/[\\/?*[\]:\u0000-\u001f]/g,' ').replace(/^'+|'+$/g,'').trim().slice(0,31)||'Sucursal';let nombre=base,n=2;while(usados.has(nombre.toLocaleLowerCase('es'))) {const sufijo=` (${n++})`;nombre=base.slice(0,31-sufijo.length)+sufijo;}usados.add(nombre.toLocaleLowerCase('es'));nombres.set(s.id,nombre);}
 return nombres;
}
export function libroCorrida(filas:readonly LineaCorrida[],filtro:FiltroCorrida,generado:string){
 const calendario=()=>formula(`HYPERLINK("${urlCalendarioCorrida(filtro).replace(/"/g,'""')}","Abrir calendario de pagos de Dodo MX")`,'Abrir calendario de pagos de Dodo MX','general');
 const incluidas=filas.filter(f=>!f.sinDistribuir),excluidas=filas.filter(f=>f.sinDistribuir);
 const destinos=[...new Map(incluidas.map(f=>[f.destinoId,{id:f.destinoId,nombre:f.destino}])).values()];
 const nombres=nombresCorrida(destinos),hojas:HojaXlsx[]=[],referencias:{nombre:string;filaTotal:number;saldo:number;metodos:Map<string,{fila:number;monto:number}>}[]=[];
 const contexto=`Fechas de pago ${filtro.desde} a ${filtro.hasta}. Saldos vigentes al ${generado}.`;
 for(const destino of destinos){
  const lista=incluidas.filter(f=>f.destinoId===destino.id),nombre=nombres.get(destino.id)!;
  const h:HojaXlsx={nombre,filas:[[`CORRIDA DE PAGO — DODO MX`],[`${destino.nombre}. ${contexto}`],['Estado','Fecha Factura','Vence','N° Factura','Proveedor','Saldo a Pagar','Importe Factura','Método de Pago','Ubicación','Notas']],anchos:[13,14,14,24,34,18,18,19,20,52],combinadas:['A1:J1','A2:J2'],estilos:{0:oscuro,1:normal,2:cabecera},inmovilizar:3,ocultarCuadricula:true,altos:{0:25,1:32,2:28}};
  const proveedores=new Map<string,LineaCorrida[]>();for(const f of lista){const key=f.rfc_receptor+'\0'+f.proveedor_id;proveedores.set(key,[...(proveedores.get(key)??[]),f]);}
  for(const documentos of proveedores.values()){
   const r=h.filas.length,primero=r+2,ultimo=primero+documentos.length-1;
   h.filas.push([`${documentos[0].proveedor} · ${documentos[0].empresa}`,null,null,null,null,formula(`SUM(F${primero}:F${ultimo})`,total(documentos)),formula(`SUM(G${primero}:G${ultimo})`,totalOriginal(documentos))]);
   h.estilos![r]=grupo;h.combinadas!.push(`A${r+1}:E${r+1}`);h.altos![r]=28;
   for(const f of documentos){const num=h.filas.length+1;
    const nota=[`Empresa: ${f.empresa} (${f.rfc_receptor}).`,`Pago ${f.pago_programado_el?'programado':'sugerido'}: ${f.fechaPago}.`,f.estado==='parcial'?'Saldo restante después de abonos.':'',f.conceptos.join('; '),...f.advertencias].filter(Boolean).join(' ');
    const notaVisible=nota.length>30000?nota.slice(0,29900)+'… Consulta el documento para ver el detalle completo.':nota;
    h.filas.push([formula(`IF(COUNT(C${num})=0,"",IF(C${num}<FECHA_CORRIDA,"Vencido","Abierto"))`,f.vence_el<filtro.fecha?'Vencido':'Abierto','general'),{fecha:f.fecha_emision},{fecha:f.vence_el},f.nombre,f.proveedor,moneda(f.saldo),moneda(f.total),f.formaPrevista??'Sin definir',f.destino,notaVisible,f.uuid??'']);
    h.estilos![num-1]=normal;h.altos![num-1]=Math.min(105,Math.max(42,Math.ceil(nota.length/65)*12));
   }
  }
  const fin=h.filas.length;h.filas.push([]);
  const filaTotal=h.filas.length+1;h.filas.push([`TOTAL ${destino.nombre}`,null,null,null,null,formula(`SUMIF(B4:B${fin},"<>",F4:F${fin})`,total(lista)),formula(`SUMIF(B4:B${fin},"<>",G4:G${fin})`,totalOriginal(lista))]);h.estilos![filaTotal-1]=oscuro;h.combinadas!.push(`A${filaTotal}:E${filaTotal}`);
  h.filas.push([],['DESGLOSE POR FORMA DE PAGO PREVISTA']);h.estilos![h.filas.length-1]=cabecera;h.combinadas!.push(`A${h.filas.length}:E${h.filas.length}`);h.altos![h.filas.length-1]=26;
  const metodos=new Map<string,{fila:number;monto:number}>();
  for(const metodo of [...new Set(lista.map(f=>f.formaPrevista??'Sin definir'))].sort()){
   const monto=total(lista.filter(f=>(f.formaPrevista??'Sin definir')===metodo)),fila=h.filas.length+1;
   h.filas.push([metodo,null,null,null,null,formula(`SUMIF(H4:H${fin},"${metodo.replace(/"/g,'""')}",F4:F${fin})`,monto)]);h.estilos![fila-1]=normal;metodos.set(metodo,{fila,monto});
  }
  h.filas[2].push('UUID');h.anchos!.push(40);h.combinadas![0]='A1:K1';h.combinadas![1]='A2:K2';
  h.filas.push([], [calendario()]);h.combinadas!.push(`A${h.filas.length}:E${h.filas.length}`);
  h.impresion={area:`$A$1:$K$${h.filas.length}`,repetirFilas:'$1:$3'};hojas.push(h);referencias.push({nombre,filaTotal,saldo:total(lista),metodos});
 }
 const resumen:HojaXlsx={nombre:'Resumen',filas:[['CORRIDA DE PAGO — DODO MX'],[contexto],['PAGO A PROVEEDORES (MXN)'],['SUCURSAL',null,'SALDO A PAGAR','FLUJO REAL DISPONIBLE','DIFERENCIA (FLUJO − PAGO)']],anchos:[48,4,24,25,28],combinadas:['A1:E1','A2:E2','A3:E3','A4:B4'],estilos:{0:oscuro,1:normal,2:oscuro,3:cabecera},altos:{0:26,1:34,3:32},inmovilizar:4,ocultarCuadricula:true};
 for(const r of referencias){const num=resumen.filas.length+1;resumen.filas.push([r.nombre,null,formula(`${refHoja(r.nombre)}!F${r.filaTotal}`,r.saldo),{texto:'',estilo:editable},formula(`IF(COUNT(D${num})=0,"",D${num}-C${num})`,'')]);resumen.combinadas!.push(`A${num}:B${num}`);resumen.estilos![num-1]=normal;resumen.altos![num-1]=24;}
 if(!referencias.length){resumen.filas.push(['Sin documentos asignados',null,moneda(0)]);resumen.estilos![4]=normal;}
 const finResumen=resumen.filas.length,filaTotal=resumen.filas.length+1;
 resumen.filas.push(['TOTAL GENERAL (MXN)',null,formula(`SUM(C5:C${finResumen})`,total(incluidas)),formula(`IF(COUNT(D5:D${finResumen})=${referencias.length||1},SUM(D5:D${finResumen}),"")`,''),formula(`IF(COUNT(D${filaTotal})=0,"",D${filaTotal}-C${filaTotal})`,'')]);resumen.estilos![filaTotal-1]=oscuro;resumen.combinadas!.push(`A${filaTotal}:B${filaTotal}`);
 resumen.filas.push([],['DESGLOSE POR FORMA PREVISTA']);resumen.estilos![resumen.filas.length-1]=cabecera;
 for(const metodo of [...new Set(incluidas.map(f=>f.formaPrevista??'Sin definir'))].sort()){
  const refs=referencias.flatMap(r=>{const m=r.metodos.get(metodo);return m?[`${refHoja(r.nombre)}!F${m.fila}`]:[]});
  const num=resumen.filas.length+1;resumen.filas.push([metodo,null,formula(`SUM(${refs.join(',')})`,total(incluidas.filter(f=>(f.formaPrevista??'Sin definir')===metodo)))]);resumen.combinadas!.push(`A${num}:B${num}`);resumen.estilos![num-1]=normal;
 }
 resumen.filas.push([],['Flujo disponible: captura manual en las celdas ámbar. No se ha consultado saldo bancario.']);let num=resumen.filas.length;resumen.combinadas!.push(`A${num}:E${num}`);resumen.altos![num-1]=30;resumen.estilos![num-1]=normal;
 resumen.filas.push(['Suma de hojas de sucursal',null,formula(referencias.length?`SUM(${referencias.map(r=>`${refHoja(r.nombre)}!F${r.filaTotal}`).join(',')})`:'0',total(incluidas))]);const control=resumen.filas.length;
 resumen.filas.push(['Diferencia contra TOTAL GENERAL',null,formula(`ROUND(C${control}-C${filaTotal},2)`,0)]);
 resumen.filas.push(['No incluidos: pendientes de distribuir',null,moneda(total(excluidas))]);
 resumen.filas.push(['Total seleccionado en el calendario',null,formula(`SUM(C${filaTotal},C${resumen.filas.length})`,total(filas))]);
 while(resumen.filas.length<19)resumen.filas.push([]);
 const fechaFila=resumen.filas.length+1;resumen.filas.push(['FECHA DE CORRIDA',null,{fecha:filtro.fecha,estilo:editable}]);resumen.estilos![fechaFila-1]=grupo;resumen.combinadas!.push(`A${fechaFila}:B${fechaFila}`);
 resumen.filas.push(['Editar la fecha actualiza Estado; los saldos y documentos son los de esta exportación.']);num=resumen.filas.length;resumen.combinadas!.push(`A${num}:E${num}`);resumen.altos![num-1]=30;resumen.estilos![num-1]=normal;
 resumen.filas.push([], [calendario()]);resumen.combinadas!.push(`A${resumen.filas.length}:E${resumen.filas.length}`);
 resumen.impresion={area:`$A$1:$E$${resumen.filas.length}`};
 const pendientes:HojaXlsx={nombre:'Pendientes de revisión',filas:[['PENDIENTES DE REVISIÓN'],['Los incluidos ya forman parte de las hojas de sucursal. No sumes estos importes otra vez.'],['#','Estatus','Hoja','Proveedor','Factura / Referencia','Monto','Qué encontré','Acción sugerida']],anchos:[5,20,24,34,26,18,65,45],combinadas:['A1:H1','A2:H2'],estilos:{0:oscuro,1:normal,2:cabecera},altos:{0:25,1:32,2:28},inmovilizar:3,ocultarCuadricula:true};
 let indice=1;for(const f of filas.filter(f=>f.advertencias.length)){const r=pendientes.filas.length;pendientes.filas.push([indice++,f.sinDistribuir?'NO INCLUIDO':'INCLUIDO · REVISAR',f.sinDistribuir?'Sin distribuir':nombres.get(f.destinoId)!,f.proveedor,f.nombre,moneda(f.saldo),f.advertencias.join(' '),f.sinDistribuir?'Asignar el saldo a cada sucursal antes de enviar a pago.':'Revisar el documento y completar los datos en Dodo MX.']);pendientes.estilos![r]={...normal,fondo:'FFF2CC'};pendientes.altos![r]=65;}
 if(indice===1){pendientes.filas.push(['Sin pendientes detectados']);pendientes.estilos![3]=normal;}
 pendientes.filas[2].push('UUID');pendientes.anchos!.push(40);
 let pendienteFila=3;for(const f of filas.filter(f=>f.advertencias.length))pendientes.filas[pendienteFila++].push(f.uuid??'');
 pendientes.filas.push([], [calendario()]);pendientes.combinadas!.push(`A${pendientes.filas.length}:E${pendientes.filas.length}`);
 pendientes.impresion={area:`$A$1:$I$${pendientes.filas.length}`,repetirFilas:'$1:$3'};
 return {hojas:[resumen,...hojas,pendientes],nombres:{FECHA_CORRIDA:`'Resumen'!$C$${fechaFila}`},incluidas:incluidas.length,excluidas:excluidas.length,total:total(incluidas)};
}
