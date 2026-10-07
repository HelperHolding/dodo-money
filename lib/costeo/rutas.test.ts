import {test} from "node:test";
import assert from "node:assert/strict";
import {buscarPorRuta} from "./rutas.ts";
test("fichas encuentran claves literales y segmentos codificados con espacios y separadores",()=>{
 const receta={clave:"bacorn bbq|6"};
 for(const clave of [receta.clave,"bacorn%20bbq%7C6"])assert.equal(buscarPorRuta([receta],clave,r=>r.clave),receta);
 const insumo={clave:"ingredients!G20"};assert.equal(buscarPorRuta([insumo],"ingredients%21G20",r=>r.clave),insumo);
 assert.equal(buscarPorRuta([receta],"otra|6",r=>r.clave),undefined);
 assert.equal(buscarPorRuta([receta],"%zz",r=>r.clave),undefined);
});
test("una clave literal con porcentajes tiene prioridad; no decodifica repetidamente",()=>{
 const literal={clave:"pizza%20especial"},otra={clave:"pizza especial"};
 assert.equal(buscarPorRuta([otra,literal],literal.clave,r=>r.clave),literal);
 assert.equal(buscarPorRuta([otra],"pizza%2520especial",r=>r.clave),undefined);
});
