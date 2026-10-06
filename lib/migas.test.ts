import { test } from "node:test";
import assert from "node:assert/strict";
import { migas } from "./migas.ts";
import { menuLateral } from "./roles.ts";

const admin = menuLateral("admin");
const texto = (r: ReturnType<typeof migas>) => r.migas.map((m) => (m.href ? `${m.texto}(${m.href})` : m.texto)).join(" › ");

test("detalle de un registro: grupo › pantalla del menú › registro; regresa a la pantalla del menú", () => {
  const r = migas("/compras/proveedores/8f0c2a8e-1b2c-4d5e-8f90-123456789abc", admin);
  assert.equal(texto(r), "Compras › Proveedores(/compras) › Proveedor");
  assert.deepEqual(r.regresar, { texto: "Proveedores", href: "/compras" });
});

test("pantallas anidadas y altas", () => {
  assert.equal(texto(migas("/compras/facturas/subir", admin)), "Compras › Facturas(/compras/facturas) › Subir facturas");
  assert.equal(texto(migas("/compras/facturas/nueva", admin)), "Compras › Facturas(/compras/facturas) › Agregar sin CFDI");
  const comparar = migas("/compras/ordenes/0c5d2f0e-0000-4000-8000-000000000001/comparar", admin);
  assert.equal(texto(comparar), "Compras › Órdenes(/compras/ordenes) › Orden(/compras/ordenes/0c5d2f0e-0000-4000-8000-000000000001) › Comparar");
  assert.deepEqual(comparar.regresar, { texto: "Orden", href: "/compras/ordenes/0c5d2f0e-0000-4000-8000-000000000001" });
  assert.equal(texto(migas("/ventas/costos/cargar", admin)), "Ventas › Costos(/ventas/costos) › Cargar costos");
  assert.equal(texto(migas("/checklists/amasado", menuLateral("gerente"))), "Sucursal › Checklists(/checklists) › Amasado de masa");
});

test("pantalla del menú: solo migas, sin botón de regresar", () => {
  const r = migas("/compras/facturas", admin);
  assert.equal(texto(r), "Compras › Facturas");
  assert.equal(r.regresar, null);
});

test("fuera del menú o en el inicio: nada", () => {
  assert.deepEqual(migas("/", admin), { migas: [], regresar: null });
  assert.deepEqual(migas("/cuenta", admin), { migas: [], regresar: null });
});

test("el detalle de un turno no lleva botón genérico (la página regresa a los turnos de su fecha)", () => {
  const r = migas("/turnos/0c5d2f0e-0000-4000-8000-000000000002", menuLateral("gerente"));
  assert.equal(texto(r), "Sucursal › Turnos(/turnos) › Turno");
  assert.equal(r.regresar, null);
});

test("programar pagos queda bajo Pagos", () => {
  assert.equal(texto(migas("/compras/pagos/programar", admin)), "Compras › Pagos(/compras/pagos) › Programar pagos");
});
