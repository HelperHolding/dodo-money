import { test } from "node:test";
import assert from "node:assert/strict";
import { esperadasPorDia, estadoEntrega, fechaEsperada, NOMBRE_ESTADO_ENTREGA } from "./entregas.ts";

test("fechaEsperada: confirmación + días naturales, cruzando mes y año", () => {
  assert.equal(fechaEsperada("2026-10-02", 3), "2026-10-05"); // viernes + 3 = lunes
  assert.equal(fechaEsperada("2026-10-30", 5), "2026-11-04");
  assert.equal(fechaEsperada("2026-12-30", 2), "2027-01-01");
  assert.equal(fechaEsperada("2026-10-02", 0), "2026-10-02"); // el mismo día
  assert.equal(fechaEsperada("2026-10-02", null), null);
});

test("estadoEntrega", () => {
  const hoy = "2026-10-05";
  assert.equal(estadoEntrega("2026-10-01", true, hoy), "recibida");
  assert.equal(estadoEntrega(null, false, hoy), "sin_fecha");
  assert.equal(estadoEntrega("2026-10-04", false, hoy), "atrasada");
  assert.equal(estadoEntrega("2026-10-05", false, hoy), "hoy");
  assert.equal(estadoEntrega("2026-10-06", false, hoy), "a_tiempo");
  assert.equal(NOMBRE_ESTADO_ENTREGA.atrasada, "Atrasada");
});

test("esperadasPorDia: solo las que tienen fecha y no se han recibido completas", () => {
  const r = esperadasPorDia([
    { id: "a", entrega_esperada: "2026-10-05", completa: false },
    { id: "b", entrega_esperada: "2026-10-05", completa: false },
    { id: "c", entrega_esperada: "2026-10-06", completa: true },
    { id: "d", entrega_esperada: null, completa: false },
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(r).map(([d, os]) => [d, os.map((o) => o.id)])), { "2026-10-05": ["a", "b"] });
});

test("fecha de entrega admite días anteriores y rechaza fechas inexistentes", async()=>{
 const {fechaEntregaValida}=await import("./entregas.ts");
 assert.equal(fechaEntregaValida("2026-10-07"),true);
 assert.equal(fechaEntregaValida("2026-02-30"),false);
 assert.equal(fechaEntregaValida("2024-02-29"),true);
 assert.equal(fechaEntregaValida("2026-2-9"),false);
});

import {recibidasPorDia} from './entregas.ts';
test('calendario recibido: fecha real, varios renglones y órdenes cerradas sin duplicar',()=>{
 const r=[{id:'r1',orden_id:'o'},{id:'r2',orden_id:'o'}],o=[{id:'o',atrasada:true}];
 const dias=recibidasPorDia([{fecha:'2026-10-07',orden_renglon_id:'r1'},{fecha:'2026-10-07',orden_renglon_id:'r2'},{fecha:'2026-10-08',orden_renglon_id:'r1'},{fecha:'2026-10-08',orden_renglon_id:null}],r,o);
 assert.equal(dias['2026-10-07'].length,1);assert.equal(dias['2026-10-08'].length,1);assert.equal(dias['2026-10-07'][0].atrasada,false);
});
