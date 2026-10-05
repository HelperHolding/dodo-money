import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hoja } from "./xlsx.ts";
import { claveExcel, emparejarCostos, leerHojaCostos, SIN_HOJA_COSTOS, type ProductoCatalogo } from "./cargaCostos.ts";

/** Hoja a partir de filas (columna A en adelante), con la estructura de la pestaña "Costo" del menú. */
function hoja(filas: (string | number | undefined)[][]): Hoja {
  const celdas = new Map<string, string | number>();
  filas.forEach((fila, r) => fila.forEach((v, c) => { if (v !== undefined && v !== "") celdas.set(`${String.fromCharCode(65 + c)}${r + 1}`, v); }));
  return { nombre: "Costo", celdas };
}

const MENU = hoja([
  ["Pizza", "Categoría", "Costo Periférico", "Costo Periférico", "Costo Periférico", "Costo 25", "Costo 30", "Costo 35", "Precio S", "Precio M", "Precio L"],
  ["Margherita", "Classic", 1.19, 1.69, 1.99, 27.912, 35.5728, 47.0415, 119, 169, 199],
  ["Pepperoni", "Pepperoni", 0.95, 1.29, 1.59, 30.0259, 39.8357, 51.7134, 95, 129, 159],
  ["Pizza Nueva", "Special", 1.39, 1.99, 2.39, 30, 40, 50, 139, 199, 239],
  [],
  ["Snacks", "Categoría", "Costo Periférico", "Costo Periférico", "Costo Periférico", "Costo M", "Costo G", "-", "Precio M", "Precio G"],
  ["Fries", "Snack", 0.39, 0.49, "-", 14.031, 22.339, "-", 39, 49],
  ["Wings", "Snack", 1.85, "-", "-", 66.6505, "-", "-", 185],
  ["Soda", "Categoría", "Costo Periférico", "Costo Periférico", "Costo Periférico", "Costo M", "Costo G"],
  ["Coca Cola (600ml -2L)", "Bebida", "-", "-", "-", 19.46, 37.38, "-", 33, 59],
  ["Dips", "Categoría", "Costo Periférico", "Costo Periférico", "Costo Periférico", "Costo "],
  ["Ranch", "Aderezo", "-", "-", "-", 6.87, "-", "-", 22],
  ["Combos", "Categoría", "", "-", "-", "Costo"],
  ["Trio Ganador", "Combos", "", "", "", 139.5457, "", "", 507, 430],
]);

const CATALOGO: ProductoCatalogo[] = [
  { dodo_id: 26, nombre: "Margarita Pequeño", categoria: null, tamano: "pequeno" },
  { dodo_id: 27, nombre: "Margarita Mediano", categoria: "pizza", tamano: "mediano" },
  { dodo_id: 28, nombre: "Margarita Mediano T", categoria: null, tamano: null },
  { dodo_id: 29, nombre: "Margarita Grande", categoria: null, tamano: "grande" },
  { dodo_id: 39, nombre: "Pepperoni Pequeño", categoria: null, tamano: "pequeno" },
  { dodo_id: 40, nombre: "Pepperoni Mediano", categoria: "pizza", tamano: "mediano" },
  { dodo_id: 42, nombre: "Pepperoni Grande", categoria: "pizza", tamano: "grande" },
  { dodo_id: 43, nombre: "Pepperoni Grande T", categoria: "pizza", tamano: "grande" },
  { dodo_id: 500, nombre: "Pizza Nueva Grande", categoria: null, tamano: "grande" },
  { dodo_id: 1000016, nombre: "Mitad y mitad Grande", categoria: null, tamano: "grande" },
  { dodo_id: 198, nombre: "Papas francesas Medium", categoria: null, tamano: "mediano" },
  { dodo_id: 199, nombre: "Papas francesas Grande", categoria: "snack", tamano: "grande" },
  { dodo_id: 208, nombre: "Alitas Buffalo 10 uds", categoria: "snack", tamano: null },
  { dodo_id: 156, nombre: "Coca-Cola 0,6 L", categoria: "bebida", tamano: null },
  { dodo_id: 157, nombre: "Coca-Cola 2 L", categoria: "bebida", tamano: null },
  { dodo_id: 232, nombre: "Dip Ranch Dip", categoria: null, tamano: null },
  { dodo_id: 900, nombre: "Producto raro", categoria: null, tamano: null },
];

test("leerHojaCostos: secciones, tamaños, periférico, guiones y celdas vacías", () => {
  const r = leerHojaCostos(MENU);
  assert.ok("filas" in r, JSON.stringify(r));
  const f = (nombre: string, tam: string) => r.filas.find((x) => x.nombre === nombre && x.tam === tam);
  assert.deepEqual(f("Margherita", "P"), { seccion: "pizza", nombre: "Margherita", tam: "P", receta: 27.912, periferico: 1.19 });
  assert.deepEqual(f("Margherita", "G"), { seccion: "pizza", nombre: "Margherita", tam: "G", receta: 47.0415, periferico: 1.99 });
  assert.deepEqual(f("Fries", "M"), { seccion: "snack", nombre: "Fries", tam: "M", receta: 14.031, periferico: 0.39 });
  assert.equal(f("Wings", "G"), undefined);
  assert.deepEqual(f("Coca Cola (600ml -2L)", "G"), { seccion: "bebida", nombre: "Coca Cola (600ml -2L)", tam: "G", receta: 37.38, periferico: 0 });
  assert.deepEqual(f("Ranch", "M"), { seccion: "dip", nombre: "Ranch", tam: "M", receta: 6.87, periferico: 0 });
  assert.equal(r.filas.some((x) => x.seccion === "combo"), true);
});

test("leerHojaCostos: sin la estructura de la pestaña Costo", () => {
  assert.deepEqual(leerHojaCostos(hoja([["Nombre", "Precio"], ["Algo", 10]])), { error: SIN_HOJA_COSTOS });
});

test("emparejarCostos: alias conocidos, tamaños, variantes T, mitad y mitad; combos fuera", () => {
  const r = leerHojaCostos(MENU);
  assert.ok("filas" in r);
  const e = emparejarCostos(r.filas, CATALOGO, new Map());
  const costo = (id: number) => e.asignaciones.find((a) => a.dodo_id === id);
  assert.deepEqual(costo(26), { dodo_id: 26, producto: "Margarita Pequeño", excel: "Margherita", tam: "P", costo: 29.1, origen: "nombre", categoria: "pizza", tamano: "pequeno", nota: "Margherita P: receta 27.91 + periférico 1.19" });
  assert.equal(costo(28)?.costo, 37.26);           // Mediano T (Thin) = costo del Mediano
  assert.equal(costo(28)?.origen, "thin");
  assert.equal(costo(43)?.costo, 53.3);            // Grande T
  assert.equal(costo(199)?.costo, 22.83);          // Fries G = Papas francesas Grande
  assert.equal(costo(198)?.costo, 14.42);          // Fries M = Papas francesas Medium
  assert.equal(costo(208)?.costo, 68.5);           // Wings = Alitas Buffalo 10 uds
  assert.equal(costo(156)?.costo, 19.46);          // Coca-Cola 600 ml, sin periférico
  assert.equal(costo(157)?.costo, 37.38);
  assert.equal(costo(232)?.costo, 6.87);           // Dip Ranch Dip
  assert.equal(costo(232)?.categoria, "otro");
  // Mitad y mitad Grande: promedio simple de las Grande de pizza del Excel que sí existen o no (Margherita, Pepperoni, Pizza Nueva).
  assert.equal(costo(1000016)?.costo, Math.round(((47.0415 + 1.99) + (51.7134 + 1.59) + (50 + 2.39)) / 3 * 100) / 100);
  assert.equal(costo(1000016)?.origen, "mitad");
  // "Pizza Nueva" no tiene alias pero su nombre coincide tal cual: entra por nombre.
  assert.equal(costo(500)?.costo, 52.39);
  // Sin producto en Dodo IS: Pizza Nueva P y M; los combos no cuentan como pendientes.
  assert.deepEqual(e.sinProducto.map((f) => `${f.nombre} ${f.tam}`), ["Pizza Nueva P", "Pizza Nueva M"]);
  assert.deepEqual(e.sinCosto.map((p) => p.dodo_id), [900]);
});

test("emparejarCostos: una equivalencia guardada gana sobre el nombre", () => {
  const r = leerHojaCostos(MENU);
  assert.ok("filas" in r);
  const guardadas = new Map([[`${claveExcel("Pizza Nueva")}|P`, 900]]);
  const e = emparejarCostos(r.filas, CATALOGO, guardadas);
  const a = e.asignaciones.find((x) => x.dodo_id === 900);
  assert.equal(a?.costo, 31.39);
  assert.equal(a?.origen, "equivalencia");
  assert.deepEqual(e.sinCosto, []);
  assert.deepEqual(e.sinProducto.map((f) => `${f.nombre} ${f.tam}`), ["Pizza Nueva M"]);
});

test("claveExcel ignora acentos, mayúsculas, espacios y lo que va entre paréntesis", () => {
  assert.equal(claveExcel(" Coca Cola  (600ml -2L) "), "coca cola");
  assert.equal(claveExcel("Jamon y Champiñonas"), "jamon y champinonas");
});
