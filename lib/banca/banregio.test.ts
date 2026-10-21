import { test } from "node:test";
import assert from "node:assert/strict";
import { centavosBanregio, leerBanregio, leerHojaBanregio, huellaBanregio } from "./banregio.ts";
import type { Hoja } from "../ventas/xlsx.ts";

function hoja():Hoja {
  const base="05800000000000000";
  const digito=(10-[...base].reduce((s,c,i)=>s+Number(c)*[3,7,1][i%3]%10,0)%10)%10;
  return {nombre:"Sheet1",celdas:new Map<string,string|number>([
    ["B2","CUENTA: 000000000001"],["B3",`CLABE: ${base}${digito}`],["B4","EMPRESA DE PRUEBA"],["B5","RFC: XAX010101000"],
    ["B9","Fecha inicio: 01/09/2026"],["C9","Fecha fin: 30/09/2026"],
    ["A10","Fecha"],["B10","Descripci\ufffdn"],["C10","Referencia"],["D10","Cargo"],["E10","Abonos"],["F10","Saldo"],["G10","Clasificaci\ufffdn"],
    ["B11","Saldo Inicial"],["F11","$0.00"],
    ["A12","15/09/2026"],["B12","ABONO PRUEBA"],["C12","_SPEI"],["E12","$100.00"],["F12","$100.00"],["G12","MOVIMIENTO CHEQUES"],
    ["A13","15/09/2026"],["B13","COMISION"],["C13","_FEE"],["D13","$1.00"],["F13","$99.00"],["G13","SERVICIOS"],
    ["A14","15/09/2026"],["B14","IVA COMISION"],["C14","_FEE"],["D14","$0.16"],["F14","$98.84"],["G14","SERVICIOS"],
  ])};
}
function cambio(ref:string,valor:string|number){const h=hoja();(h.celdas as Map<string,string|number>).set(ref,valor);return h;}
test("Banregio separa periodo solicitado de fechas reales y valida centavos",()=>{
 const r=leerHojaBanregio(hoja());
 assert.equal(r.movimientos.length,3);assert.equal(r.abonos,100);assert.equal(r.cargos,1.16);assert.equal(r.saldoInicial,0);assert.equal(r.saldoFinal,98.84);
 assert.equal(r.hasta,"2026-09-30");assert.equal(r.ultimaFecha,"2026-09-15");assert.equal(r.avisos.length,2);
 assert.equal(r.movimientos[0].fila,12);assert.equal(r.movimientos[0].original[4],"$100.00");
});
test("referencia repetida de comisión e IVA no elimina movimientos",()=>{
 const r=leerHojaBanregio(hoja());assert.equal(new Set(r.movimientos.map(m=>m.huella)).size,3);assert.equal(r.movimientos[1].referencia,r.movimientos[2].referencia);
});
test("dinero estricto: comas, blancos, decimales y valores inválidos",()=>{
 assert.equal(centavosBanregio("$1,234.56"),123456);assert.equal(centavosBanregio("$-0.01"),-1);assert.equal(centavosBanregio(" ",true),0);
 for(const v of ["",null,"$1.234","NaN","Infinity","$1,23.45","0x10","1e3"]) assert.throws(()=>centavosBanregio(v));
});
test("fecha se toma de la columna, nunca de la descripción SPEI",()=>{
 const r=leerHojaBanregio(cambio("B12","SPEI 058-17/09/2026/17 PRUEBA"));assert.equal(r.movimientos[0].fecha,"2026-09-15");
});
test("rechaza saldo inconsistente, importes negativos, doble cargo/abono y cero",()=>{
 assert.throws(()=>leerHojaBanregio(cambio("F13","$98.00")),/saldo/);
 assert.throws(()=>leerHojaBanregio(cambio("D13","$-1.00")),/positivo/);
 assert.throws(()=>leerHojaBanregio(cambio("D12","$1.00")),/positivo/);
 assert.throws(()=>leerHojaBanregio(cambio("E12","$0.00")),/positivo/);
});
test("rechaza fecha inválida, fuera del periodo y fuera de orden",()=>{
 for(const v of ["31/09/2026","15/08/2026","2026-09-15"]) assert.throws(()=>leerHojaBanregio(cambio("A12",v)),/fecha/i);
 assert.throws(()=>leerHojaBanregio(cambio("A13","14/09/2026")),/orden/);
});
test("rechaza columnas desplazadas, cuenta y CLABE inválidas",()=>{
 assert.throws(()=>leerHojaBanregio(cambio("D10","Saldo")),/columnas/);
 assert.throws(()=>leerHojaBanregio(cambio("B2","CUENTA: 12")),/identificar/);
 assert.throws(()=>leerHojaBanregio(cambio("B3","CLABE: 058000000000000000")),/CLABE/);
});
test("rechaza fórmulas, varias hojas y renglones inesperados",()=>{
 assert.throws(()=>leerBanregio([hoja(),hoja()]),/sola hoja/);
 assert.throws(()=>leerHojaBanregio({...hoja(),formulas:new Map([["F12","1+2"]])}),/fórmulas/);
 assert.throws(()=>leerHojaBanregio(cambio("B15","TOTAL AJUSTADO")),/Fila 15/);
});
test("huella conserva texto y depende de importes y saldo; es independiente de fila",()=>{
 const r=leerHojaBanregio(hoja()),m=r.movimientos[0];assert.equal(huellaBanregio({...m,fila:99} as typeof m),m.huella);
 assert.notEqual(huellaBanregio({...m,saldo:101}),m.huella);assert.notEqual(huellaBanregio({...m,descripcion:"OTRO"}),m.huella);
});
