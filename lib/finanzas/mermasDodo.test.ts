import test from "node:test";
import assert from "node:assert/strict";
import { leerMermasDodo, resumirMermas } from "./mermasDodo.ts";
const razones="Fecha de caducidad pasada,Deterioro del producto,Embalaje dañado,Factor humano,Marketing,Fecha de caducidad pasada de escaparate,Deterioro de productos por escaparates";
const sucursales=[{id:"s1",nombre:"Zapopan-1"}];
function insumos(cambios:Record<string,string|number>={}) {return {nombre:"Zapopan-1",celdas:new Map(Object.entries({A2:"Unidad/Tienda",C2:"Zapopan-1",A3:"Motivo de la deducción",C3:razones,A4:"Periodo",C4:"21/09/2026 : 23/09/2026",A5:"Tipo de informe",C5:"Por fechas",A7:"ID",B7:"Suministros",E7:"Precio (Sin IVA)",F7:"Costar (Sin IVA)",G7:"21 de septiembre",H7:"22 de septiembre",I7:"23 de septiembre",B8:"Ingrediente",A9:123,B9:"Queso",C9:"Kg",D9:3,E9:0.333,F9:1,G9:1,H9:1,I9:1,...cambios}))};}
function productos(cambios:Record<string,string|number>={}) {return {nombre:"Pérdida del producto",celdas:new Map(Object.entries({A2:"Unidad/Tienda",D2:"Zapopan-1",A3:"Motivo de la deducción",D3:razones.replaceAll(",",";"),A4:"Periodo",D4:"21/09/2026-23/09/2026",A7:"Nombre",B7:"Fecha",C7:"Qty.",D7:"COGS (Sin IVA)",E7:"Importe (Sin IVA)",A8:"Pizza",B8:"21/09/2026 11:51 p.m.",C8:1,D8:10,E8:10,A9:"Pizza",B9:"21/09/2026 09:00 a.m.",C9:2,D9:10,E9:20,...cambios}))};}
const leer=(hojas:ReturnType<typeof insumos>[])=>leerMermasDodo(hojas,sucursales,"2026-10-06");
test("mermas: conserva centavos al repartir costos y separa productos",()=>{const r=leer([insumos(),productos()]);assert.deepEqual(r.errores,[]);assert.equal(r.dias.length,3);assert.deepEqual(r.filas.filter(f=>f.tipo==="insumo").map(f=>f.costo),[0.33,0.33,0.34]);const p=r.filas.find(f=>f.tipo==="producto")!;assert.equal(p.cantidad,3);assert.equal(p.costo,30);const d=resumirMermas(r.filas,r.dias).at(-1)!;assert.equal(d.costoInsumos,.33);assert.equal(d.costoProductos,30);});
test("mermas: conserva días vacíos y señala costos cero",()=>{const r=leer([insumos({D9:1,G9:1,H9:0,I9:0,E9:0,F9:0})]);assert.equal(r.dias.length,3);assert.equal(r.filas.length,1);assert.equal(r.filas[0].sin_costo,true);assert.equal(resumirMermas(r.filas,r.dias)[0].insumos,0);});
for(const [titulo,cambios] of Object.entries({"cantidades que no suman":{D9:4},"costo negativo":{F9:-1},"sucursal desconocida":{C2:"Otra"},"reporte parcial":{C3:"Marketing"},"fechas futuras":{C4:"21/09/2026 : 23/09/2027"},"periodo imposible":{C4:"31/09/2026 : 01/10/2026"},"IVA incluido":{E7:"Precio (Con IVA)"},"reporte por razones":{C5:"Por motivos de deducciones"},"día que falta":{H7:"24 de septiembre"}})) test(`mermas: rechaza ${titulo}`,()=>{const r=leer([insumos(cambios)]);assert.ok(r.errores.length);assert.equal(r.filas.length,0);assert.equal(r.dias.length,0);});
test("mermas: rechaza hojas repetidas y productos fuera del periodo",()=>{assert.ok(leer([insumos(),insumos()]).errores.length);assert.ok(leer([insumos(),productos(),productos()]).errores.length);assert.ok(leer([insumos(),productos({B8:"24/09/2026"})]).errores.length);});
test("mermas: admite cruce de año",()=>{const r=leerMermasDodo([insumos({C4:"31/12/2025 : 02/01/2026",G7:"31 de diciembre",H7:"1 de enero",I7:"2 de enero"})],sucursales,"2026-10-06");assert.deepEqual(r.errores,[]);assert.equal(r.dias[2].fecha,"2026-01-02");});


test("cobertura distingue hoja de productos vacía, ausente y periodo parcial",()=>{
 const ausente=leer([insumos()]);assert.ok(ausente.dias.every(d=>d.productos_completos===false));
 const vacia=leer([insumos(),productos({A8:"",B8:"",C8:"",D8:"",E8:"",A9:"",B9:"",C9:"",D9:"",E9:""})]);
 assert.deepEqual(vacia.errores,[]);assert.ok(vacia.dias.every(d=>d.productos_completos===true));
 const parcial=leer([insumos(),productos({D4:"21/09/2026-21/09/2026"})]);
 assert.deepEqual(parcial.errores,[]);assert.deepEqual(parcial.dias.map(d=>d.productos_completos),[true,false,false]);
});
