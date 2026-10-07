import {comisionesCobro} from "../finanzas/comisiones.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {aplicarConciliaciones, type ConciliacionVenta} from "./conciliacion.ts";
const dia={sucursal_id:"s",fecha:"2026-10-01",importacion_id:"i",total:100,iva:16,efectivo:60,tarjeta:40,en_linea:0};
const c:ConciliacionVenta={id:"c",sucursal_id:"s",fecha:dia.fecha,importacion_id:"i",efectivo:10,tarjeta:90,en_linea:0,conciliar_productos:true,motivo:"Cobro en terminal",registrado_por:"a",registrado_en:"2026-10-02",anulado_en:null,motivo_anulacion:null,original:{total:100,iva:16,efectivo:60,tarjeta:40,en_linea:0,suma_productos:80,bruta_productos:100,productos:1}};
test("conciliación redistribuye cobros y preserva venta, IVA y original",()=>{
 const [r]=aplicarConciliaciones([dia],[c]);
 assert.equal(r.efectivo,10);assert.equal(r.tarjeta,90);assert.equal(r.conciliada,true);
 assert.equal(r.total,100);assert.equal(r.iva,16);assert.equal(dia.efectivo,60);
});
test("reimportación, anulación o sucursal distinta invalidan la conciliación",()=>{
 for(const ajuste of [{...c,importacion_id:"anterior"},{...c,anulado_en:"2026-10-03"},{...c,sucursal_id:"otra"},{...c,fecha:"2026-10-02"}]) {
  const [r]=aplicarConciliaciones([dia],[ajuste]);assert.equal(r.efectivo,60);assert.equal(r.conciliada,false);
 }
});
test("solo corregir pagos no autoriza diferencia de productos",()=>{
 const [r]=aplicarConciliaciones([dia],[{...c,conciliar_productos:false}]);assert.equal(r.tarjeta,90);assert.equal(r.conciliada,false);
});

test("el pago correcto cambia la comisión de terminal sin cambiar la venta",()=>{
 const [r]=aplicarConciliaciones([dia],[c]);
 const vigente=(clave:string)=>clave==="netpay_pct"?.025:0;
 const original=comisionesCobro([{...dia,agregador:{total:0,tarjeta:0,en_linea:0}}],vigente);
 const corregido=comisionesCobro([{...r,agregador:{total:0,tarjeta:0,en_linea:0}}],vigente);
 assert.equal(original.netpay,1);assert.equal(corregido.netpay,2.25);assert.equal(r.total,dia.total);
});
