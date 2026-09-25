import { test } from "node:test";
import assert from "node:assert/strict";
import { alertasDeSucursal, fechaElegida, ordenarSucursales, primerError, type DatosSucursal } from "./corporativo.ts";

const base: DatosSucursal = {
  id: "a", nombre: "Zapopan-1",
  turnosAbiertos: 0, turnosCerrados: 2,
  diferenciaArqueos: 0, arqueosDescuadrados: 0, pendientes: 0, deposito: 5000,
  cierre: { cerradoEn: "2026-09-26T05:00:00Z", ventaTotal: 20000, bovedaDiferencia: 0 },
  masa: { total: 13, registradas: 13, faltantes: 0, fueraDeNorma: 0 },
  recorrido: { total: 12, hechos: 12, faltantes: 0, conFallas: 0 },
  mermasCerradas: true, mermas: 3, gastos: 250, sinComprobante: 0,
};

test("una sucursal en orden no tiene alertas", () => {
  assert.deepEqual(alertasDeSucursal(base, true), []);
});

test("centavos de redondeo no son alerta; una diferencia real sí", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, diferenciaArqueos: 0.004 }, true), []);
  assert.deepEqual(alertasDeSucursal({ ...base, diferenciaArqueos: -120, arqueosDescuadrados: 1 }, true), ["arqueos"]);
  assert.deepEqual(alertasDeSucursal({ ...base, cierre: { ...base.cierre!, bovedaDiferencia: 50 } }, true), ["boveda"]);
});

test("falta de cierre y mermas sin cerrar solo son alerta cuando el día terminó", () => {
  const abierta = { ...base, cierre: null, mermasCerradas: false };
  assert.deepEqual(alertasDeSucursal(abierta, false), []);
  assert.deepEqual(alertasDeSucursal(abierta, true), ["cierre", "mermas"]);
});

test("día cerrado sin depósito es alerta", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, deposito: 0 }, true), ["deposito"]);
});

test("pendientes, checklists y gastos sin comprobante", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, pendientes: 2 }, true), ["pendientes"]);
  assert.deepEqual(alertasDeSucursal({ ...base, masa: { ...base.masa, faltantes: 1 } }, true), ["masa"]);
  assert.deepEqual(alertasDeSucursal({ ...base, masa: { ...base.masa, fueraDeNorma: 1 } }, true), ["masa"]);
  assert.deepEqual(alertasDeSucursal({ ...base, recorrido: { ...base.recorrido, conFallas: 1 } }, true), ["recorrido"]);
  assert.deepEqual(alertasDeSucursal({ ...base, sinComprobante: 1 }, true), ["comprobantes"]);
});

test("una sucursal nueva sin actividad a media tarde no marca nada que aún no toca", () => {
  const nueva: DatosSucursal = {
    ...base, turnosCerrados: 0, deposito: 0, cierre: null, mermasCerradas: false, mermas: 0, gastos: 0,
    masa: { total: 13, registradas: 0, faltantes: 0, fueraDeNorma: 0 },
    recorrido: { total: 12, hechos: 0, faltantes: 0, conFallas: 0 },
  };
  assert.deepEqual(alertasDeSucursal(nueva, false), []);
});

test("las sucursales con alertas van primero y luego por nombre", () => {
  const filas = [
    { nombre: "Zapopan-1", alertas: [] },
    { nombre: "Tlaquepaque", alertas: ["pendientes"] as const },
    { nombre: "Ávila Camacho", alertas: [] },
    { nombre: "Chapalita", alertas: ["masa"] as const },
  ];
  assert.deepEqual(ordenarSucursales(filas).map((f) => f.nombre), ["Chapalita", "Tlaquepaque", "Ávila Camacho", "Zapopan-1"]);
});

test("fechaElegida usa hoy si la fecha falta, está mal formada o es futura", () => {
  assert.equal(fechaElegida(undefined, "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("ayer", "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("2026-09-27", "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("2026-09-20", "2026-09-26"), "2026-09-20");
});

test("dos turnos descuadrados que se compensan (+500 y −500) siguen siendo alerta", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, diferenciaArqueos: 0, arqueosDescuadrados: 2 }, true), ["arqueos"]);
});

test("fechaElegida rechaza fechas que no existen", () => {
  assert.equal(fechaElegida("2026-00-10", "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("2026-09-00", "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("2026-02-31", "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("2024-02-29", "2026-09-26"), "2024-02-29");
});

test("primerError devuelve el primer mensaje de error o null si todo cargó", () => {
  assert.equal(primerError([{ error: null }, { error: null }]), null);
  assert.equal(primerError([{ error: null }, { error: { message: "timeout" } }, { error: { message: "otro" } }]), "timeout");
});
