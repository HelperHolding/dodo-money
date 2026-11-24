import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorProveedor, enlaceRazon } from "./agruparProveedor.ts";

type F = { id: string; prov: string; nombre: string; saldo: number; fecha: string };
const f = (id: string, prov: string, nombre: string, saldo: number, fecha: string): F => ({ id, prov, nombre, saldo, fecha });
const opciones = { clave: (x: F) => x.prov, nombre: (x: F) => x.nombre, monto: (x: F) => x.saldo, fecha: (x: F) => x.fecha };

test("las facturas de un proveedor quedan juntas, con su total, y el proveedor más urgente arriba", () => {
  const filas = [
    f("1", "p-slov", "Slovensko", 9500, "2026-11-27"),
    f("2", "p-lact", "Lácteos", 600.1, "2026-11-24"),
    f("3", "p-slov", "Slovensko", 5700, "2026-11-24"),
    f("4", "p-lact", "Lácteos", 1035.2, "2026-11-25"),
    f("5", "p-bolp", "Bolpack", 2029.23, "2026-11-30"),
  ];
  const g = agruparPorProveedor(filas, opciones);
  assert.deepEqual(g.map((x) => [x.proveedor, x.facturas.map((y) => y.id), x.total]), [
    ["Lácteos", ["2", "4"], 1635.3],
    ["Slovensko", ["3", "1"], 15200],
    ["Bolpack", ["5"], 2029.23],
  ]);
});

test("misma primera fecha: por nombre; misma fecha dentro del grupo: el orden recibido", () => {
  const g = agruparPorProveedor([f("1", "b", "Begoser", 1, "2026-11-24"), f("2", "a", "Alfredo", 1, "2026-11-24"), f("3", "a", "Alfredo", 1, "2026-11-24")], opciones);
  assert.deepEqual(g.map((x) => [x.proveedor, x.facturas.map((y) => y.id)]), [["Alfredo", ["2", "3"]], ["Begoser", ["1"]]]);
});

test("la tarjeta de razón social pone o quita el filtro y conserva los demás", () => {
  assert.equal(enlaceRazon({ proveedor: "p1", sucursal: "" }, "HCM260306B93", ""), "?proveedor=p1&empresa=HCM260306B93");
  assert.equal(enlaceRazon({ proveedor: "p1", empresa: "HCM260306B93" }, "HCM260306B93", "HCM260306B93"), "?proveedor=p1");
  assert.equal(enlaceRazon({ empresa: "HCM260306B93" }, "CMS230321FI8", "HCM260306B93"), "?empresa=CMS230321FI8");
  assert.equal(enlaceRazon({}, null, ""), "?");
});
