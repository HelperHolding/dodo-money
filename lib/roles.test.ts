import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enlaceActivo, enlacesDelMenu, esCorporativo, grupoAbierto, menuLateral, NOMBRE_ROL, puedeAbrirTurno, puedeEditarCompras, puedeEntrar, puedeRecibirCompras,
  puedeGestionar, puedeImportarVentas, puedeRecibirEfectivo, puedeVerEfectivo, puedeVerTurnos, puedeSupervisar, puedeVerCompras, puedeVerVentas, veAvisoSinCosto, veVentasDeTodas,
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

test("compras: admin edita, corporativo consulta, sucursal no entra", () => {
  assert.equal(puedeEditarCompras("admin"), true);
  assert.equal(puedeVerCompras("admin"), true);
  assert.equal(puedeVerCompras("corporativo"), true);
  assert.equal(puedeEditarCompras("corporativo"), false);
  for (const rol of ["operacion", "encargado", "gerente"] as const) {
    assert.equal(puedeVerCompras(rol), false);
    assert.equal(puedeEditarCompras(rol), false);
  }
});

test("recepciones de compras: encargado, gerente y admin reciben; operación y corporativo no", () => {
  for (const rol of ["encargado", "gerente", "admin"] as const) {
    assert.equal(puedeRecibirCompras(rol), true);
  }
  for (const rol of ["operacion", "corporativo"] as const) {
    assert.equal(puedeRecibirCompras(rol), false);
  }
});

type R = Parameters<typeof menuLateral>[0];
const grupos = (rol: R) => menuLateral(rol).grupos.map((g) => g.titulo);
const grupo = (rol: R, titulo: string) => menuLateral(rol).grupos.find((g) => g.titulo === titulo)?.enlaces.map((e) => e.href);

test("menú lateral: cada puesto ve solo sus grupos", () => {
  assert.deepEqual(grupos("operacion"), ["Sucursal"]);
  assert.deepEqual(grupos("encargado"), ["Sucursal"]);
  assert.deepEqual(grupos("gerente"), ["Sucursal", "Ventas"]);
  assert.deepEqual(grupos("admin"), ["Sucursal", "Efectivo", "Ventas", "Compras"]);
  assert.deepEqual(grupos("corporativo"), ["Sucursal", "Efectivo", "Ventas", "Compras"]);
});

test("menú lateral: Inicio arriba; corporativo empieza en la vista general", () => {
  assert.deepEqual(menuLateral("admin").inicio, { href: "/", texto: "Inicio" });
  assert.deepEqual(menuLateral("operacion").inicio, { href: "/", texto: "Inicio" });
  assert.deepEqual(menuLateral("corporativo").inicio, { href: "/corporativo", texto: "Vista general" });
});

test("menú lateral: grupo Sucursal por puesto (Recepciones solo para quien recibe)", () => {
  assert.deepEqual(grupo("operacion", "Sucursal"), ["/arqueo", "/movimientos", "/caja-chica", "/cierre", "/checklists"]);
  assert.equal(puedeVerTurnos("operacion"), false);
  for (const rol of ["encargado", "gerente", "admin", "corporativo"] as const) assert.equal(puedeVerTurnos(rol), true);
  for (const rol of ["encargado", "gerente", "admin"] as const) {
    assert.deepEqual(grupo(rol, "Sucursal"), ["/arqueo", "/turnos", "/movimientos", "/caja-chica", "/cierre", "/checklists", "/recepciones"]);
  }
  assert.deepEqual(grupo("corporativo", "Sucursal"), ["/", "/arqueo", "/turnos", "/movimientos", "/caja-chica", "/cierre", "/checklists"]);
});

test("menú lateral: Ventas y Compras por puesto", () => {
  assert.deepEqual(grupo("admin", "Ventas"), ["/ventas", "/ventas/importar", "/ventas/costos"]);
  assert.deepEqual(grupo("gerente", "Ventas"), ["/ventas"]);
  assert.deepEqual(grupo("corporativo", "Ventas"), ["/ventas"]);
  assert.deepEqual(grupo("admin", "Compras"),
    ["/compras", "/compras/articulos", "/compras/ordenes", "/compras/recepciones", "/compras/facturas", "/compras/pagos", "/compras/cargar"]);
  assert.deepEqual(grupo("corporativo", "Compras"),
    ["/compras", "/compras/articulos", "/compras/ordenes", "/compras/recepciones", "/compras/facturas", "/compras/pagos"]);
});

test("enlaceActivo elige la ruta más larga de todo el menú", () => {
  const todos = enlacesDelMenu(menuLateral("admin"));
  assert.equal(enlaceActivo("/ventas", todos), "/ventas");
  assert.equal(enlaceActivo("/ventas/costos", todos), "/ventas/costos");
  assert.equal(enlaceActivo("/", todos), "/");
  assert.equal(enlaceActivo("/checklists/ronda", todos), "/checklists");
  assert.equal(enlaceActivo("/turnos/abc", todos), "/turnos");
  assert.equal(enlaceActivo("/compras/proveedores/abc", todos), "/compras");
  assert.equal(enlaceActivo("/compras/ordenes/abc", todos), "/compras/ordenes");
  assert.equal(enlaceActivo("/otra", todos), undefined);
});

test("efectivo a corporativo: admin y corporativo lo ven; solo corporativo recibe", () => {
  for (const rol of ["admin", "corporativo"] as const) {
    assert.equal(puedeVerEfectivo(rol), true);
    assert.deepEqual(grupo(rol, "Efectivo"), ["/efectivo"]);
  }
  for (const rol of ["operacion", "encargado", "gerente"] as const) assert.equal(puedeVerEfectivo(rol), false);
  assert.equal(puedeRecibirEfectivo("corporativo"), true);
  for (const rol of ["operacion", "encargado", "gerente", "admin"] as const) assert.equal(puedeRecibirEfectivo(rol), false);
  assert.equal(grupoAbierto(menuLateral("admin"), "/efectivo"), "Efectivo");
});

test("grupoAbierto: se abre el grupo de la página actual", () => {
  const admin = menuLateral("admin");
  assert.equal(grupoAbierto(admin, "/compras/ordenes/abc"), "Compras");
  assert.equal(grupoAbierto(admin, "/ventas/costos"), "Ventas");
  assert.equal(grupoAbierto(admin, "/cierre"), "Sucursal");
  assert.equal(grupoAbierto(admin, "/"), undefined);
  assert.equal(grupoAbierto(menuLateral("corporativo"), "/"), "Sucursal");
  assert.equal(grupoAbierto(menuLateral("corporativo"), "/corporativo"), undefined);
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
