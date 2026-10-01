import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASE_ESTADO_SALIDA, estadoSalida, NOMBRE_ESTADO_SALIDA, resumenEnCamino } from "./salidas.ts";

test("estadoSalida sigue el recorrido sucursal → admin → corporativo", () => {
  assert.equal(estadoSalida({ estado: "pendiente", recepcion: null }), "por_recoger");
  assert.equal(estadoSalida({ estado: "confirmado", recepcion: null }), "en_camino");
  assert.equal(estadoSalida({ estado: "confirmado", recepcion: "aceptada" }), "en_corporativo");
  assert.equal(estadoSalida({ estado: "confirmado", recepcion: "rechazada" }), "no_cuadro");
  assert.equal(estadoSalida({ estado: "rechazado", recepcion: null }), "rechazada");
});

test("nombres y colores de cada estado", () => {
  assert.equal(NOMBRE_ESTADO_SALIDA.por_recoger, "Por recoger");
  assert.equal(NOMBRE_ESTADO_SALIDA.en_camino, "Salida de sucursal");
  assert.equal(NOMBRE_ESTADO_SALIDA.en_corporativo, "En corporativo");
  assert.equal(NOMBRE_ESTADO_SALIDA.no_cuadro, "No cuadró");
  assert.equal(CLASE_ESTADO_SALIDA.en_corporativo, "confirmado");
  assert.equal(CLASE_ESTADO_SALIDA.rechazada, "rechazado");
});

test("resumenEnCamino cuenta y suma solo lo que va en camino", () => {
  const r = resumenEnCamino([
    { estado: "confirmado", recepcion: null, monto: 1500 },
    { estado: "confirmado", recepcion: null, monto: "250.50" },
    { estado: "pendiente", recepcion: null, monto: 999 },
    { estado: "confirmado", recepcion: "aceptada", monto: 999 },
    { estado: "confirmado", recepcion: "rechazada", monto: 999 },
    { estado: "rechazado", recepcion: null, monto: 999 },
  ]);
  assert.deepEqual(r, { cuantas: 2, total: 1750.5, porRecoger: 1, noCuadro: 1 });
  assert.deepEqual(resumenEnCamino([]), { cuantas: 0, total: 0, porRecoger: 0, noCuadro: 0 });
});
