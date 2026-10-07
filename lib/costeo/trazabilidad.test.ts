import {test} from "node:test";
import assert from "node:assert/strict";
import {insumoDeMaterial,preciosRappi} from "./trazabilidad.ts";
import type {Insumo,Material} from "./bom";
import type {RappiGuardada} from "../ventas/rappi";
test("material solo enlaza a insumo exacto y único, sin semejanzas",()=>{
 const i:Insumo={nombre:"Piña",precio:80,unidad:"kg",medida:"kg",merma:0,referencia:"ingredients!G3",avisos:[]};
 const m:Material={nombre:"PINA",cantidad:20,unidad:"g",precio:80,importe:1.6,porciones:null,medida:"g",referencia:"Pizza!E15"};
 assert.equal(insumoDeMaterial(m,[i]),i);assert.equal(insumoDeMaterial(m,[i,{...i,referencia:"ingredients!G4"}]),null);assert.equal(insumoDeMaterial({...m,nombre:"Piña extra"},[i]),null);
});
test("precio Rappi divide el bruto por piezas, excluye canceladas y respeta vínculos, opciones y fecha",()=>{
 const base={rappi_id:"12345",tienda_id:"MX1",sucursal_id:"s",fecha:"2026-10-01",hora:"12:00",estado:"Finalizado",archivo:"historial.xlsx",rappi_lineas:[{producto_id:7,nombre:"Pepperoni",opciones:"30 cm",cantidad:2,importe:318}]} as RappiGuardada;
 const resultados=preciosRappi(145,[base,{...base,rappi_id:"12346",estado:"Cancelado"},{...base,rappi_id:"12347",fecha:"2026-10-02"}],[{id:7,clave:"x",nombre:"Pepperoni",dodo_id:145}]);
 assert.equal(resultados.length,2);assert.equal(resultados[0].precio,159);assert.equal(resultados[0].orden,"12347");assert.equal(resultados[0].opciones,"30 cm");
 assert.equal(preciosRappi(999,[base],[{id:7,clave:"x",nombre:"Pepperoni",dodo_id:145}]).length,0);
});
