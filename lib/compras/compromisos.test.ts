import { test } from "node:test";
import assert from "node:assert/strict";
import { ventanaCompromisos, avisosCompromisos, estadoPago, filtrarPrevistos, leerCompromiso, previstosPorDia, servicioSinComprobar, textoFrecuencia, tituloCompromiso, type FechaCompromiso } from "./compromisos.ts";

const fecha = (x: Partial<FechaCompromiso> = {}): FechaCompromiso => ({
  compromiso_id: "c1", vence: "2026-11-01", fecha_id: null, factura_id: null, factura_estado: null, factura_saldo: null,
  omitida_motivo: null, servicio: "pendiente", servicio_fecha: null, servicio_nota: null, revision: 0, ...x,
});

test("texto de la frecuencia", () => {
  assert.equal(textoFrecuencia({ unidad: "mes", cada: 1, dia_mes: 1, inicio: "2026-11-01" }), "Cada mes, día 1");
  assert.equal(textoFrecuencia({ unidad: "mes", cada: 2, dia_mes: 31, inicio: "2026-11-01" }), "Cada 2 meses, día 31 (o el último del mes)");
  assert.equal(textoFrecuencia({ unidad: "semana", cada: 1, dia_mes: null, inicio: "2026-11-03" }), "Cada semana, los martes");
  assert.equal(textoFrecuencia({ unidad: "semana", cada: 2, dia_mes: null, inicio: "2026-11-07" }), "Cada 2 semanas, los sábados");
});

test("título: concepto o descripción de 'otro', con sucursal", () => {
  assert.equal(tituloCompromiso({ concepto: "renta", descripcion: null }, "Zapopan"), "Renta · Zapopan");
  assert.equal(tituloCompromiso({ concepto: "otro", descripcion: "Alarma" }, "Zapopan"), "Alarma · Zapopan");
});

test("estado del pago de una fecha", () => {
  assert.equal(estadoPago(fecha(), "2026-10-28"), "previsto");
  assert.equal(estadoPago(fecha({ vence: "2026-10-01" }), "2026-10-28"), "vencido");
  assert.equal(estadoPago(fecha({ factura_id: "f", factura_estado: "parcial" }), "2026-10-28"), "por_pagar");
  assert.equal(estadoPago(fecha({ factura_id: "f", factura_estado: "pagada" }), "2026-10-28"), "pagada");
  assert.equal(estadoPago(fecha({ omitida_motivo: "Mes de gracia" }), "2026-10-28"), "omitida");
  // Factura cancelada: la fecha vuelve a quedar sin factura.
  assert.equal(estadoPago(fecha({ vence: "2026-10-01", factura_id: "f", factura_estado: "cancelada" }), "2026-10-28"), "vencido");
});

test("servicio sin comprobar: solo si lo requiere, ya venció, no está omitida y sigue pendiente", () => {
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01" }), true, "2026-10-28"), true);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01" }), false, "2026-10-28"), false);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-11-01" }), true, "2026-10-28"), false);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01", servicio: "realizado" }), true, "2026-10-28"), false);
  assert.equal(servicioSinComprobar(fecha({ vence: "2026-10-01", omitida_motivo: "x x x x x" }), true, "2026-10-28"), false);
});

test("avisos", () => {
  const fs = [fecha({ vence: "2026-10-01" }), fecha({ vence: "2026-10-05", compromiso_id: "c2" }), fecha({ vence: "2026-12-01" })];
  assert.deepEqual(avisosCompromisos(fs, (id) => id === "c2", "2026-10-28"), { vencidosSinFactura: 2, serviciosSinComprobar: 1 });
});

test("previstos por día de pago: sin factura vigente ni omisión", () => {
  const fs = [
    fecha({ vence: "2026-11-01" }),
    fecha({ vence: "2026-12-01", factura_id: "f", factura_estado: "por_pagar" }),
    fecha({ vence: "2027-01-01", omitida_motivo: "Mes de gracia" }),
    fecha({ vence: "2026-10-01" }),
  ];
  const datos = new Map([["c1", { monto: 45000, titulo: "Renta · Zapopan" }]]);
  const r = previstosPorDia(fs, datos, "2026-10-28", (v) => (v === "2026-11-01" ? "2026-10-30" : v));
  assert.deepEqual(Object.keys(r).sort(), ["2026-10-01", "2026-10-30"]);
  assert.deepEqual(r["2026-10-30"], [{ compromisoId: "c1", vence: "2026-11-01", fechaPago: "2026-10-30", monto: 45000, titulo: "Renta · Zapopan", vencido: false }]);
  assert.equal(r["2026-10-01"][0].vencido, true);
});

test("filtros de Pagos: sucursal, proveedor y oficina", () => {
  const cs = [{ id: "a", sucursal_id: "s1", proveedor_id: "p1" }, { id: "b", sucursal_id: "s2", proveedor_id: "p2" }];
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "", proveedor: "" }).map((c) => c.id), ["a", "b"]);
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "s2", proveedor: "" }).map((c) => c.id), ["b"]);
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "", proveedor: "p1" }).map((c) => c.id), ["a"]);
  assert.deepEqual(filtrarPrevistos(cs, { sucursal: "oficina", proveedor: "" }), []);
});

test("leer el formulario", () => {
  const base: Record<string, string> = { sucursal_id: "s1", concepto: "renta", descripcion: "", proveedor_id: "p1", monto_estimado: "$45,000.50", forma_pago: "transferencia", unidad: "mes", cada: "1", dia_mes: "31", inicio: "2026-11-30", fin: "", requiere_servicio: "" };
  const leer = (x: Record<string, string>) => leerCompromiso((c) => x[c] ?? "");
  assert.deepEqual(leer(base), { datos: { ...base, monto_estimado: "45000.50", requiere_servicio: "false" } });
  assert.deepEqual(leer({ ...base, unidad: "semana" }), { datos: { ...base, monto_estimado: "45000.50", unidad: "semana", dia_mes: "", requiere_servicio: "false" } });
  assert.equal((leer({ ...base, requiere_servicio: "si" }) as { datos: Record<string, string> }).datos.requiere_servicio, "true");
  assert.deepEqual(leer({ ...base, monto_estimado: "0" }), { error: "Escribe el monto estimado (mayor a cero)." });
  assert.deepEqual(leer({ ...base, concepto: "otro" }), { error: "Describe el compromiso (al menos 3 letras)." });
  assert.deepEqual(leer({ ...base, dia_mes: "32" }), { error: "El día del mes va del 1 al 31." });
  assert.deepEqual(leer({ ...base, cada: "13" }), { error: "La frecuencia va de 1 a 12." });
  assert.deepEqual(leer({ ...base, fin: "2026-11-01" }), { error: "El fin no puede ser antes del inicio." });
  assert.deepEqual(leer({ ...base, proveedor_id: "" }), { error: "Elige sucursal y proveedor." });
});

test("ventana de fechas: los últimos 3 meses (lo que el detalle deja atender) y los próximos 12", () => {
  assert.deepEqual(ventanaCompromisos("2026-10-28"), { desde: "2026-07-28", hasta: "2027-10-28" });
  assert.deepEqual(ventanaCompromisos("2026-05-31"), { desde: "2026-02-28", hasta: "2027-05-31" });
});
