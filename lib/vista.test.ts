import { test } from "node:test";
import assert from "node:assert/strict";
import { hrefVista, leerVista } from "./vista.ts";

test("leerVista: lista solo si se pide; lo demás son tarjetas", () => {
  assert.equal(leerVista("lista"), "lista");
  assert.equal(leerVista("tarjetas"), "tarjetas");
  assert.equal(leerVista(undefined), "tarjetas");
  assert.equal(leerVista("otra"), "tarjetas");
});

test("hrefVista conserva los filtros y quita los avisos", () => {
  assert.equal(hrefVista("/compras", { q: "gas lp", categoria: "consumible", ok: "Guardado", error: undefined }, "lista"),
    "/compras?q=gas+lp&categoria=consumible&vista=lista");
  assert.equal(hrefVista("/compras", { q: "", vista: "lista" }, "tarjetas"), "/compras");
});
