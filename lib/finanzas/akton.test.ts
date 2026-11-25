import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPL, entradaVacia, sumarEntradas, type EntradaPL, type Meta } from "./pl.ts";
import { favorable, indicadoresAkton, lecturaEbitda, notasPorRenglon, renglonesAkton } from "./akton.ts";

const ctx = { ventaNeta: 1000, ventaRappi: 200, plantilla: { cocina: 100, gerencia: 50 } };
const metas: Meta[] = [
  { renglon: "alimento", tipo: "pct", valor: 0.25 }, { renglon: "merma", tipo: "pct", valor: 0.02 },
  { renglon: "nomina_cocina", tipo: "plantilla", valor: 0 }, { renglon: "nomina_gerencia", tipo: "plantilla", valor: 0 },
  { renglon: "marketing", tipo: "pct", valor: 0.03 }, { renglon: "renta", tipo: "monto", valor: 80 },
  { renglon: "agregadores", tipo: "pct_rappi", valor: 0.2 },
];
const entrada = (): EntradaPL => {
  const e = entradaVacia();
  e.canales.dodo = { bruta: 1000, brutaSinIva: 900, neta: 800, alimento: 200, pedidos: 40 };
  e.canales.rappi = { bruta: 260, brutaSinIva: 240, neta: 200, alimento: 60, pedidos: 10 };
  return { ...e, ventaNeta: 1000, alimento: 260, merma: 30, nomina: { cocina: 120, gerencia: 50 }, agregadores: 50, rappiExcedente: 5, gastos: { marketing: 70, renta: 80 } };
};

test("indicadores: venta, descuento, pedidos por día, ticket por canal, prime cost y EBITDA de tienda", () => {
  const e = entrada();
  const filas = calcularPL(e, metas, ctx);
  const k = indicadoresAkton(e, filas, 5);
  assert.equal(k.ventaNeta, 1000);
  assert.equal(k.ventaBruta, 1140);
  assert.equal(k.descuentoPct, 0.1228);
  assert.equal(k.pedidos, 50);
  assert.equal(k.pedidosDia, 10);
  assert.equal(k.ticketPos, 20);
  assert.equal(k.ticketRappi, 20);
  assert.equal(k.alimentoMermaPct, 0.29);
  assert.equal(k.alimentoMermaMetaPct, 0.27);
  assert.equal(k.primeCostPct, 0.46);
  const tienda = filas.find((f) => f.clave === "ebitda_tienda")!;
  assert.equal(k.ebitdaTienda, tienda.monto);
  assert.equal(k.ebitdaTiendaMeta, tienda.meta);
});

test("indicadores sin pedidos (entradas que no los traen): sin dato, no cero", () => {
  const e = entradaVacia();
  const k = indicadoresAkton({ ...e, ventaNeta: 100 }, calcularPL({ ...e, ventaNeta: 100 }, [], ctx), 3);
  assert.equal(k.pedidos, null);
  assert.equal(k.ticketPos, null);
  assert.equal(k.alimentoMermaMetaPct, null);
});

test("sumarEntradas suma los pedidos por canal", () => {
  const s = sumarEntradas([entrada(), entrada()]);
  assert.equal(s.canales.dodo.pedidos, 80);
  assert.equal(s.canales.rappi.pedidos, 20);
});

test("favorable: gasto abajo de meta y total arriba de meta; sin meta o sin capturar no se colorea", () => {
  assert.equal(favorable({ tipo: "gasto", diferencia: -5, sinCapturar: false }), true);
  assert.equal(favorable({ tipo: "gasto", diferencia: 5, sinCapturar: false }), false);
  assert.equal(favorable({ tipo: "total", diferencia: 5, sinCapturar: false }), true);
  assert.equal(favorable({ tipo: "total", diferencia: -5, sinCapturar: false }), false);
  assert.equal(favorable({ tipo: "gasto", diferencia: null, sinCapturar: false }), null);
  assert.equal(favorable({ tipo: "gasto", diferencia: -80, sinCapturar: true }), null);
});

test("lectura: brecha del EBITDA de tienda y los renglones más desfavorables, sin oficina", () => {
  const filas = calcularPL({ ...entrada(), oficina: 500 }, [...metas, { renglon: "oficina", tipo: "monto", valor: 10 }], ctx);
  const l = lecturaEbitda(filas);
  const tienda = filas.find((f) => f.clave === "ebitda_tienda")!;
  assert.equal(l.diferencia, tienda.diferencia);
  assert.deepEqual(l.causas.map((c) => c.clave), ["marketing", "nomina_cocina", "alimento"]);
  assert.deepEqual(l.causas.map((c) => c.exceso), [40, 20, 10]);
});

test("renglones: orden Akton, sub-renglones POS/Rappi, descuentos por canal y Rappi neto", () => {
  const filas = calcularPL(entrada(), metas, ctx);
  const r = renglonesAkton(filas, (f) => /^nomina_(cocina|gerencia)_/.test(f.clave) && !f.monto);
  const claves = r.map((x) => x.clave);
  assert.deepEqual(claves.slice(0, 11), ["s-venta", "venta_bruta", "venta_bruta_dodo", "venta_bruta_rappi", "descuentos_venta", "descuentos_dodo", "descuentos_rappi", "venta_neta", "venta_neta_dodo", "venta_neta_rappi", "s-costo"]);
  assert.equal(r.find((x) => x.clave === "descuentos_dodo")!.monto, 100);
  assert.equal(r.find((x) => x.clave === "descuentos_rappi")!.monto, 40);
  assert.ok(claves.indexOf("margen_bruto") < claves.indexOf("s-rappi"));
  assert.ok(claves.indexOf("rappi_neto") < claves.indexOf("s-operacion"));
  const excedente = r.find((x) => x.clave === "rappi_excedente")!;
  assert.equal(excedente.ingreso, true);
  assert.equal(excedente.nombre, "excedente DAR sin IVA");
  assert.equal(r.find((x) => x.clave === "rappi_fuera_base"), undefined, "ingreso en cero no se muestra");
  const neto = r.find((x) => x.clave === "rappi_neto")!;
  assert.equal(neto.monto, -45);
  assert.equal(neto.meta, -40);
  assert.equal(neto.favorable, false);
  assert.equal(r.find((x) => x.clave === "ebitda_tienda")!.nivel, "destacado");
  assert.equal(r.find((x) => x.clave === "marketing")!.favorable, false);
  assert.equal(r.find((x) => x.clave === "renta")!.favorable, null);
  assert.equal(claves.at(-1), "ebitda");
  // Ningún renglón del P&L se pierde: cada fila no oculta aparece una vez.
  for (const f of filas) if (!(/^nomina_(cocina|gerencia)_/.test(f.clave) && !f.monto) && f.clave !== "rappi_fuera_base") assert.equal(claves.filter((c) => c === f.clave).length, 1, f.clave);
});

test("sin movimientos de Rappi no aparece el grupo", () => {
  const e = entrada();
  const filas = calcularPL({ ...e, agregadores: 0, rappiExcedente: 0 }, metas.filter((m) => m.renglon !== "agregadores"), ctx);
  assert.equal(renglonesAkton(filas).some((x) => x.clave === "rappi_neto"), false);
});

test("notas: cada aviso va a su renglón y lo demás queda general", () => {
  const { porRenglon, generales } = notasPorRenglon([
    "Mermas: faltan 2 días por importar; el resultado es provisional.",
    "Marketing: 3 productos regalados sin costo.",
    "Rappi: reporte financiero aplicado.",
    "Nómina 2026-10: se usa plantilla estimada; falta capturar el desglose real del mes.",
    "4 productos vendidos sin costo quedan fuera del alimento.",
    "Posible duplicado en Renta: Fulano tiene 2 documentos vigentes.",
    "Conciliación manual 2026-10-03: motivo.",
  ]);
  assert.equal(porRenglon.get("merma")!.length, 1);
  assert.equal(porRenglon.get("marketing")!.length, 1);
  assert.equal(porRenglon.get("rappi_neto")!.length, 1);
  assert.equal(porRenglon.get("nomina_cocina")!.length, 1);
  assert.equal(porRenglon.get("alimento")!.length, 1);
  assert.equal(porRenglon.get("renta")!.length, 1);
  assert.deepEqual(generales, ["Conciliación manual 2026-10-03: motivo."]);
});
