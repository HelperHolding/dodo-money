import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enlaceActivo, enlacesSucursal, enlacesVentas, esCorporativo, puedeAbrirTurno, puedeGestionar, puedeImportarVentas,
  puedeSupervisar, puedeVerVentas, veVentasDeTodas,
} from "./roles.ts";

test("corporativo solo consulta: no abre turno, no supervisa, no gestiona", () => {
  assert.equal(esCorporativo("corporativo"), true);
  assert.equal(puedeAbrirTurno("corporativo"), false);
  assert.equal(puedeSupervisar("corporativo"), false);
  assert.equal(puedeGestionar("corporativo"), false);
});

test("los roles de sucursal conservan sus permisos", () => {
  assert.equal(puedeAbrirTurno("cajero"), false);
  assert.equal(puedeSupervisar("cajero"), false);
  assert.equal(puedeAbrirTurno("encargado"), true);
  assert.equal(puedeSupervisar("encargado"), true);
  assert.equal(puedeGestionar("encargado"), false);
  for (const rol of ["gerente", "admin"] as const) {
    assert.equal(puedeAbrirTurno(rol), true);
    assert.equal(puedeSupervisar(rol), true);
    assert.equal(puedeGestionar(rol), true);
    assert.equal(esCorporativo(rol), false);
  }
});

test("ventas: gerente, admin y corporativo ven; solo admin importa", () => {
  for (const rol of ["cajero", "encargado"] as const) assert.equal(puedeVerVentas(rol), false);
  for (const rol of ["gerente", "admin", "corporativo"] as const) assert.equal(puedeVerVentas(rol), true);
  assert.equal(veVentasDeTodas("gerente"), false);
  assert.equal(veVentasDeTodas("admin"), true);
  assert.equal(veVentasDeTodas("corporativo"), true);
  for (const rol of ["cajero", "encargado", "gerente", "corporativo"] as const) assert.equal(puedeImportarVentas(rol), false);
  assert.equal(puedeImportarVentas("admin"), true);
});

test("menú de sucursal: Ventas solo para quien la ve; Corporativo solo para corporativo", () => {
  const hrefs = (rol: Parameters<typeof enlacesSucursal>[0]) => enlacesSucursal(rol).map((e) => e.href);
  assert.ok(!hrefs("cajero").includes("/ventas"));
  assert.ok(!hrefs("encargado").includes("/ventas"));
  assert.ok(hrefs("gerente").includes("/ventas"));
  assert.equal(hrefs("corporativo")[0], "/corporativo");
  assert.ok(!hrefs("admin").includes("/corporativo"));
});

test("menú de ventas por rol", () => {
  assert.deepEqual(enlacesVentas("admin").map((e) => e.href), ["/", "/ventas", "/ventas/importar", "/ventas/costos"]);
  assert.deepEqual(enlacesVentas("gerente").map((e) => e.href), ["/", "/ventas"]);
  assert.deepEqual(enlacesVentas("corporativo").map((e) => e.href), ["/corporativo", "/ventas"]);
});

test("enlaceActivo elige la ruta más larga", () => {
  const enlaces = enlacesVentas("admin");
  assert.equal(enlaceActivo("/ventas", enlaces), "/ventas");
  assert.equal(enlaceActivo("/ventas/costos", enlaces), "/ventas/costos");
  assert.equal(enlaceActivo("/", enlaces), "/");
  assert.equal(enlaceActivo("/checklists/ronda", enlacesSucursal("gerente")), "/checklists");
  assert.equal(enlaceActivo("/otra", enlaces), undefined);
});
