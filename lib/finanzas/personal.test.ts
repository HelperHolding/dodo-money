import { test } from "node:test";
import assert from "node:assert/strict";
import { generarPersonal,extraerContpaqi,aplicarContpaqi,type Persona } from "./personal.ts";
import type { Hoja } from "../ventas/xlsx.ts";
const datos={nombre:"HERNANDEZ CORTES EDGAR RAUL",puesto:"Cajero",renglon:"cocina" as const,ingreso:null,baja:null,nota:"Reporte",sueldo:12000,bono:0,imss:2013.72,cesantia:832.68,retiro:251.84,impuesto:240,infonavit:629.58,ajuste:48.74};
const p:Persona={id:"p1",codigo:"002",sucursal_id:"s1",personal_versiones:[{id:"v1",desde:"2026-09-01",hasta:"2026-09-30",datos}]};
function hoja():Hoja {
 const c=new Map<string,string|number>([["A1","CONTPAQi"],["B4","Periodo 17 al 18 Quincenal del 01/09/2026 al 30/09/2026"],["B8","Empleado"],["I8","*TOTAL* *PERCEPCIONES*"],["AG8","I.M.S.S. empresa"],["AK8","*TOTAL* *OBLIGACIONES*"],["A14","002"],["B14",datos.nombre],["C14",12000],["I14",12500],["AG14",2013.72],["AB14",832.68],["AD14",251.84],["AE14",240],["AH14",629.58],["AK14",4016.56]]);
 c.set("A23","Total Gral.");c.set("I23",12500);c.set("AK23",4016.56);
 return {nombre:"Hoja1",celdas:c};
}
test("perfiles: vigencia mensual, lugar y baja; no convierte pendiente a cero",()=>{
 assert.equal(generarPersonal([p],"s1","2026-09").empleados[0].sueldo,12000);
 assert.equal(generarPersonal([p],null,"2026-09").empleados.length,0);
 const octubre=generarPersonal([p],"s1","2026-10");assert.equal(octubre.empleados[0].sueldo,null);assert.ok(octubre.avisos.length);
 const baja={...p,personal_versiones:[{...p.personal_versiones[0],datos:{...datos,baja:"2026-08-31"}}]};assert.equal(generarPersonal([baja],"s1","2026-09").empleados.length,0);
});
test("ingreso o cambios durante el mes requieren revisar importes; versión corregida no se usa",()=>{
 const parcial={...p,personal_versiones:[{...p.personal_versiones[0],datos:{...datos,ingreso:"2026-09-15"}}]};assert.equal(generarPersonal([parcial],"s1","2026-09").empleados[0].sueldo,null);
 const corregida={...p,personal_versiones:[{...p.personal_versiones[0],sustituida_en:"2026-10-09",datos:{...datos,sueldo:99999}}, {...p.personal_versiones[0],id:"v2",datos:{...datos,sueldo:13000}}]};assert.equal(generarPersonal([corregida],"s1","2026-09").empleados[0].sueldo,13000);
});
test("CONTPAQi: percepciones, subtotal IMSS y diferencia del total reportado",()=>{
 const filas=extraerContpaqi(hoja(),"2026-09");assert.equal(filas.length,1);assert.equal(filas[0].bono,500);assert.equal(filas[0].imss,2013.72);assert.equal(filas[0].ajuste,48.74);
 assert.throws(()=>extraerContpaqi(hoja(),"2026-10"),/mes completo/);
 const c=new Map(hoja().celdas);c.delete("AG14");assert.throws(()=>extraerContpaqi({nombre:"H",celdas:c},"2026-09"),/AG14/);
});
test("importación vincula código y nombre; faltantes no desaparecen ni reutilizan estimaciones",()=>{
 const ricardo={...p,id:"p2",codigo:"RV",personal_versiones:[{...p.personal_versiones[0],id:"v2",datos:{...datos,nombre:"Ricardo Villa",puesto:"Gerente",renglon:"gerencia" as const,sueldo:22000}}]};
 const b=aplicarContpaqi([p,ricardo],"s1","2026-09",extraerContpaqi(hoja(),"2026-09"));assert.equal(b.empleados.length,2);assert.equal(b.empleados[0].bono,500);assert.equal(b.empleados[1].sueldo,null);assert.ok(b.avisos.some(a=>a.includes("no aparece")));assert.ok(b.avisos.some(a=>a.includes("costo del perfil")));
 assert.throws(()=>aplicarContpaqi([{...p,codigo:"003"}],"s1","2026-09",extraerContpaqi(hoja(),"2026-09")),/No se pudo vincular/);
 assert.throws(()=>aplicarContpaqi([p],null,"2026-09",extraerContpaqi(hoja(),"2026-09")),/No se pudo vincular/);
});
