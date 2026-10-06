import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {leerBOM,nombreDodo,emparejarBOM,type ModeloBOM} from "./bom.ts";
import type {Hoja} from "../ventas/xlsx.ts";

const hoja=(nombre:string,c:Record<string,string|number>,f:Record<string,string>={}):Hoja=>({nombre,celdas:new Map(Object.entries(c)),formulas:new Map(Object.entries(f))});
const ingredientes=()=>hoja("ingredients",{A2:"INGREDIENT NAME",G2:"PRICE/KG",A4:"Masa",G4:20,H4:"piece",A5:"Caja",G5:3,H5:"piece"});
const pizza=()=>hoja("Pepperoni",{C4:"Pepperoni 30Т",D4:129,E4:7.7,C10:"Ingredient",C11:"Masa",D11:"Piece",E11:235,G11:235,H11:20,I11:4.7,C12:"Caja",D12:"Piece",E12:1,G12:1,H12:3,I12:3},{E4:'SUMIF(I11:I12, ">0")',I11:"H11*G11/1000",I12:"H12*G12"});
test("BOM: masa en gramos aunque diga Piece; cajas por pieza; conserva Thin",()=>{
  const m=leerBOM([ingredientes(),pizza()]);
  assert.equal(m.recetas[0].costo,7.7);assert.equal(m.recetas[0].materiales[0].unidad,"g");
  assert.equal(m.recetas[0].materiales[1].unidad,"pieza");assert.equal(m.insumos[0].unidad,"kg");
  assert.equal(nombreDodo(m.recetas[0].nombre),"pepperoni mediano t");
});
test("BOM: no importa plantillas ni pestañas ocultas",()=>{
  const p=pizza();assert.equal(leerBOM([ingredientes(),p,{...p,nombre:"viejo",oculta:true},{...p,nombre:"template"}]).recetas.length,1);
});
test("BOM: bloquea totales parciales, fórmulas con error, precios distintos y cero",()=>{
  for(const cambio of [{I11:"#VALUE!"},{G11:"#N/A"},{H11:0,I11:0,E4:3},{H11:30,I11:7.05,E4:10.05},{E4:100}]) {
    const p=pizza();p.celdas=new Map([...p.celdas,...Object.entries(cambio)]);
    assert.equal(leerBOM([ingredientes(),p]).recetas[0].costo,null);
  }
});
test("BOM: una fila nombrada sin cantidades no se interpreta como costo cero",()=>{
  const p=pizza();p.celdas=new Map([...p.celdas,["C13","Servilletas"]]);p.formulas=new Map([...p.formulas!,["E4",'SUMIF(I11:I13, ">0")']]);
  assert.equal(leerBOM([ingredientes(),p]).recetas[0].costo,null);
});
test("BOM: no confunde Thin y normal; nombres ambiguos requieren vínculo",()=>{
  const receta=leerBOM([ingredientes(),pizza()]).recetas[0];
  const c=[{dodo_id:40,nombre:"Pepperoni Mediano"},{dodo_id:41,nombre:"Pepperoni Mediano T"}];
  assert.equal(emparejarBOM([receta],c,new Map())[0].dodo_id,41);
  assert.equal(emparejarBOM([receta],[...c,{dodo_id:44,nombre:"Pepperoni Mediano T"}],new Map())[0].dodo_id,null);
  assert.equal(emparejarBOM([receta],c,new Map([[receta.clave,0]]))[0].dodo_id,null);
});
test("UC Mexico adjunto: suma independiente de componentes y recetas con errores en cuarentena",()=>{
  const m=JSON.parse(readFileSync(new URL('./uc-mexico.json',import.meta.url),'utf8')) as ModeloBOM;
  assert.equal(m.insumos.length,62);assert.equal(m.recetas.length,129);assert.equal(m.recetas.filter(r=>r.costo!==null).length,119);
  for(const r of m.recetas.filter(r=>r.costo!==null)) {
    const suma=r.materiales.reduce((s,i)=>s+i.cantidad!*i.precio!/(i.unidad==='g'?1000:1),0);
    assert.equal(Math.round(suma*100)/100,r.costo,r.nombre);
  }
  const normal=m.recetas.find(r=>r.nombre==='Pepperoni 30')!,thin=m.recetas.find(r=>r.nombre==='Pepperoni 30Т')!;
  assert.equal(normal.materiales[0].cantidad,345);assert.equal(thin.materiales[0].cantidad,235);
  assert.equal(normal.costo,38.55);assert.equal(thin.costo,36.94);
  assert.equal(m.recetas.find(r=>r.nombre==='Pollo BBQ 25')!.costo,null);
  assert.equal(m.recetas.find(r=>r.nombre==='Wings')!.precioVenta,139);
  assert.equal(m.recetas.find(r=>r.nombre==='Chicken pieces')!.precioVenta,155);
});
