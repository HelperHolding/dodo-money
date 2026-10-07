import {referenciaBOM} from "./referenciaMerma.ts";
import type {ModeloBOM} from "../costeo/bom";
import {test} from "node:test";
import assert from "node:assert/strict";
import {valorarMermas,mermaParaPL,type CostoMerma} from "./mermasPL.ts";
import type {MermaDodo} from "./mermasDodo";
const producto:MermaDodo={sucursal_id:"s",fecha:"2026-10-01",tipo:"producto",clave:"pizza",nombre:"Pizza",unidad:"piezas",categoria:"Producto terminado",cantidad:2,costo:40,sin_costo:false};
const costo:CostoMerma={id:"c",orden:1,sucursal_id:"s",clave:"pizza",vigente_desde:"2026-10-01",costo_unitario:30,fuente:"Receta sin IVA confirmada",registrado_en:"2026-10-01T12:00:00Z",anulado_en:null};
const dia={sucursal_id:"s",fecha:"2026-10-01",productos_completos:true};
test("merma P&L separa productos e insumos adicionales al BOM",()=>{
 const insumo={...producto,tipo:"insumo" as const,clave:"queso",costo:100};
 const filas=valorarMermas([producto,insumo],[]);
 const r=mermaParaPL(filas,[dia],dia.fecha,dia.fecha);
 assert.equal(r.monto,40);assert.equal(r.insumos,1);assert.equal(r.productos.length,1);assert.equal(r.parcial,false);
 assert.equal(r.insumosMonto,100);assert.equal(r.insumosParcial,false);
});
test("insumos desconocidos no son cero; solo suma costos conocidos y conserva pendientes",()=>{
 const insumo={...producto,tipo:"insumo" as const,clave:"queso",costo:100};
 const desconocido={...insumo,clave:"salsa",costo:0,sin_costo:true};
 const r=mermaParaPL(valorarMermas([insumo,desconocido],[]),[dia],dia.fecha,dia.fecha);
 assert.equal(r.insumosMonto,100);assert.equal(r.sinCostoInsumos,1);assert.equal(r.insumosParcial,true);
 assert.equal(mermaParaPL(valorarMermas([desconocido],[]),[dia],dia.fecha,dia.fecha).insumosMonto,null);
 assert.equal(mermaParaPL([],[dia],dia.fecha,dia.fecha).insumosMonto,0);
 assert.equal(mermaParaPL([],[],dia.fecha,dia.fecha).insumosMonto,null);
});
test("sin costo o sin importación no se interpreta como cero",()=>{
 const r=mermaParaPL(valorarMermas([{...producto,costo:0,sin_costo:true}],[]),[{...dia,productos_completos:false}],dia.fecha,dia.fecha);
 assert.equal(r.monto,null);assert.equal(r.sinCosto,1);assert.equal(r.sinCobertura,1);assert.equal(r.parcial,true);
 assert.equal(mermaParaPL(valorarMermas([{...producto,costo:0,sin_costo:true}],[]),[dia],dia.fecha,dia.fecha).monto,null);
 const vacio=mermaParaPL([],[],dia.fecha,dia.fecha);assert.equal(vacio.monto,null);assert.equal(vacio.sinImportar,1);
});
test("un día completo sin bajas es cero; faltar otro día deja parcial",()=>{
 const r=mermaParaPL([],[dia],dia.fecha,dia.fecha);assert.equal(r.monto,0);assert.equal(r.parcial,false);
 const parcial=mermaParaPL([],[dia],dia.fecha,"2026-10-02");assert.equal(parcial.monto,0);assert.equal(parcial.parcial,true);assert.equal(parcial.sinImportar,1);
});
test("costo sin IVA vigente valora cantidad y conserva original, sucursal y días previos",()=>{
 const filas=valorarMermas([producto,{...producto,fecha:"2026-09-30"},{...producto,sucursal_id:"otra"}], [costo]);
 assert.equal(filas[0].costo_pl,60);assert.equal(filas[0].costo,40);assert.equal(producto.costo,40);
 assert.equal(filas[1].costo_pl,40);assert.equal(filas[2].costo_pl,40);
});
test("correcciones de misma fecha tienen orden determinista; anular recupera anterior",()=>{
 const nueva={...costo,id:"otra",orden:2,costo_unitario:40};
 assert.equal(valorarMermas([producto],[nueva,costo])[0].costo_pl,80);
 assert.equal(valorarMermas([producto],[{...nueva,anulado_en:"2026-10-02"},costo])[0].costo_pl,60);
});
test("parcial suma solo conocidos; rango no incluye otros días",()=>{
 const desconocido={...producto,clave:"otra",costo:0,sin_costo:true};
 const r=mermaParaPL(valorarMermas([producto,desconocido,{...producto,fecha:"2026-10-02",costo:999}],[]),[dia],dia.fecha,dia.fecha);
 assert.equal(r.monto,40);assert.equal(r.sinCosto,1);assert.equal(r.parcial,true);
});
test("costo fuera de rango queda pendiente; periodos vacíos no inventan merma",()=>{
 assert.equal(valorarMermas([{...producto,cantidad:1e9}],[{...costo,costo_unitario:999999}])[0].costo_pl,null);
 const r=mermaParaPL([],[],"2026-10-02","2026-10-01");assert.equal(r.monto,null);assert.equal(r.parcial,false);
});


test("BOM es referencia exacta y vigente; no asigna recetas ambiguas ni futuras",()=>{
 const modelo:ModeloBOM={insumos:[{nombre:"Corn (Elote)",precio:69.03,unidad:"kg",medida:"",merma:.34,referencia:"ingredients!G4",avisos:[]}],recetas:[{clave:"p",nombre:"Pepperoni 30",hoja:"30",referencia:"E4",categoria:"pizza",tamano:"30",precioVenta:129,costo:38.55,materiales:[],avisos:[]}],preparaciones:[],avisos:[]};
 const v={id:"v",vigente_desde:"2026-10-01",actualizado_en:"2026-10-01",modelo,archivo:"BOM.xlsx"};
 const r={...producto,nombre:"Pepperoni Mediano"};
 assert.equal(referenciaBOM(r,[v])?.precio,38.55);
 assert.equal(referenciaBOM({...r,fecha:"2026-09-30"},[v]),null);
 assert.equal(referenciaBOM(r,[{...v,modelo:{...modelo,recetas:[...modelo.recetas,...modelo.recetas]}}]),null);
 assert.equal(referenciaBOM({...r,nombre:"Pepperoni Mediano H"},[v]),null);
 const insumo=referenciaBOM({...producto,tipo:"insumo",nombre:"Elote",unidad:"L"},[v]);
 assert.equal(insumo?.unidad,"kg");assert.equal(insumo?.merma,.34);
 // La referencia no cambia el costo de Dodo IS ni convierte litros en kg.
 assert.equal(valorarMermas([r],[])[0].costo_pl,40);
});
