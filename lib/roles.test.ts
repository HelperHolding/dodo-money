import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enlaceActivo, enlacesCompras, enlacesSucursal, enlacesVentas, esCorporativo, NOMBRE_ROL, puedeAbrirTurno, puedeEditarCompras, puedeEntrar,
  puedeGestionar, puedeImportarVentas, puedeSupervisar, puedeVerCompras, puedeVerVentas, veAvisoSinCosto, veVentasDeTodas,
} from "./roles.ts";

test("corporativo solo consulta: no abre turno, no supervisa, no gestiona", () => {
  assert.equal(esCorporativo("corporativo"), true);
  assert.equal(puedeAbrirTurno("corporativo"), false);
  assert.equal(puedeSupervisar("corporativo"), false);
  assert.equal(puedeGestionar("corporativo"), false);
});

test("los roles de sucursal conservan sus permisos", () => {
  assert.equal(puedeAbrirTurno("operacion"), false);
  assert.equal(puedeSupervisar("operacion"), false);
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
  for (const rol of ["operacion", "encargado"] as const) assert.equal(puedeVerVentas(rol), false);
  for (const rol of ["gerente", "admin", "corporativo"] as const) assert.equal(puedeVerVentas(rol), true);
  assert.equal(veVentasDeTodas("gerente"), false);
  assert.equal(veVentasDeTodas("admin"), true);
  assert.equal(veVentasDeTodas("corporativo"), true);
  for (const rol of ["operacion", "encargado", "gerente", "corporativo"] as const) assert.equal(puedeImportarVentas(rol), false);
  assert.equal(puedeImportarVentas("admin"), true);
});

test("menú de sucursal: Ventas solo para quien la ve; Corporativo solo para corporativo", () => {
  const hrefs = (rol: Parameters<typeof enlacesSucursal>[0]) => enlacesSucursal(rol).map((e) => e.href);
  assert.ok(!hrefs("operacion").includes("/ventas"));
  assert.ok(!hrefs("encargado").includes("/ventas"));
  assert.ok(hrefs("gerente").includes("/ventas"));
  assert.equal(hrefs("corporativo")[0], "/corporativo");
  assert.ok(!hrefs("admin").includes("/corporativo"));
});

test("menú de ventas por rol", () => {
  assert.deepEqual(enlacesVentas("admin").map((e) => e.href), ["/", "/ventas", "/ventas/importar", "/ventas/costos", "/compras"]);
  assert.deepEqual(enlacesVentas("gerente").map((e) => e.href), ["/", "/ventas"]);
  assert.deepEqual(enlacesVentas("corporativo").map((e) => e.href), ["/corporativo", "/ventas", "/compras"]);
});

test("compras: admin edita, corporativo consulta, sucursal no entra", () => {
  assert.equal(puedeEditarCompras("admin"), true);
  assert.equal(puedeVerCompras("admin"), true);
  assert.equal(puedeVerCompras("corporativo"), true);
  assert.equal(puedeEditarCompras("corporativo"), false);
  for (const rol of ["operacion", "encargado", "gerente"] as const) {
    assert.equal(puedeVerCompras(rol), false);
    assert.equal(puedeEditarCompras(rol), false);
  }
  assert.ok(enlacesSucursal("admin").some((e) => e.href === "/compras"));
  assert.ok(!enlacesSucursal("gerente").some((e) => e.href === "/compras"));
});

test("menú de compras por rol", () => {
  assert.deepEqual(enlacesCompras("admin").map((e) => e.href), ["/", "/compras", "/compras/articulos", "/compras/cargar"]);
  assert.deepEqual(enlacesCompras("corporativo").map((e) => e.href), ["/corporativo", "/compras", "/compras/articulos"]);
  assert.equal(enlaceActivo("/compras/proveedores/abc", enlacesCompras("admin")), "/compras");
  assert.equal(enlaceActivo("/compras/articulos", enlacesCompras("admin")), "/compras/articulos");
});

test("enlaceActivo elige la ruta más larga", () => {
  const enlaces = enlacesVentas("admin");
  assert.equal(enlaceActivo("/ventas", enlaces), "/ventas");
  assert.equal(enlaceActivo("/ventas/costos", enlaces), "/ventas/costos");
  assert.equal(enlaceActivo("/", enlaces), "/");
  assert.equal(enlaceActivo("/checklists/ronda", enlacesSucursal("gerente")), "/checklists");
  assert.equal(enlaceActivo("/otra", enlaces), undefined);
});

test("aviso de productos sin costo: admin y corporativo lo ven; gerente, encargado y operación no", () => {
  for (const rol of ["admin", "corporativo"] as const) assert.equal(veAvisoSinCosto(rol), true);
  for (const rol of ["gerente", "encargado", "operacion"] as const) assert.equal(veAvisoSinCosto(rol), false);
});

test("nombre de cada puesto como se muestra en la app", () => {
  assert.deepEqual(NOMBRE_ROL, { operacion: "Operación", encargado: "Encargado", gerente: "Gerente", admin: "Administrador", corporativo: "Corporativo" });
});

test("un usuario desactivado no entra", () => {
  assert.equal(puedeEntrar({ activo: true }), true);
  assert.equal(puedeEntrar({ activo: false }), false);
});
