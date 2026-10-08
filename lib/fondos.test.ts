import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeCierre, problemaSalida, retiroABoveda, salidaSugerida } from "./fondos.ts";

test("reserva adicional conserva fondo, salida comprometida y efectivo para el proveedor",()=>{
 const b={saldoBoveda:20000,fondoBoveda:4500,salidasPendientes:1000,reservas:6000};
 assert.equal(salidaSugerida(b),8500);
 assert.equal(problemaSalida(8500,b),null);
 assert.match(problemaSalida(8500.01,b)!,/reservados para pagos/);
 // Consumir una parte de la reserva reduce efectivo y compromiso en el mismo importe.
 assert.equal(salidaSugerida({...b,saldoBoveda:17000,reservas:3000}),8500);
 assert.equal(salidaSugerida({...b,reservas:0}),14500);
});

test("retiroABoveda: todo lo que pase del fondo del cajón va a la bóveda", () => {
  assert.equal(retiroABoveda(9850.5, 500), 9350.5);
  assert.equal(retiroABoveda(500, 500), 0);
  assert.equal(retiroABoveda(300, 500), 0);
});

test("salidaSugerida: la bóveda se queda con su fondo, descontando salidas por recoger", () => {
  assert.equal(salidaSugerida({ saldoBoveda: 28300, salidasPendientes: 0, fondoBoveda: 4500 }), 23800);
  assert.equal(salidaSugerida({ saldoBoveda: 28300, salidasPendientes: 20000, fondoBoveda: 4500 }), 3800);
  assert.equal(salidaSugerida({ saldoBoveda: 4000, salidasPendientes: 0, fondoBoveda: 4500 }), 0);
});

test("problemaSalida no deja dejar la bóveda debajo de su fondo", () => {
  const b = { saldoBoveda: 28300, salidasPendientes: 0, fondoBoveda: 4500 };
  assert.equal(problemaSalida(23800, b), null);
  assert.equal(problemaSalida(1000, b), null);
  assert.equal(problemaSalida(23800.01, b),
    "Con esa salida la bóveda quedaría con $4,499.99 y debe quedarse con $4,500.00. Lo más que puede salir es $23,800.00.");
  assert.equal(problemaSalida(100, { saldoBoveda: 4500, salidasPendientes: 0, fondoBoveda: 4500 }),
    "Con esa salida la bóveda quedaría con $4,400.00 y debe quedarse con $4,500.00. Ahora no puede salir nada.");
});

test("mensajeCierre: al cerrar, el retiro a la bóveda ya se registró solo", () => {
  assert.equal(mensajeCierre(2115, 500), "Arqueo de cierre guardado y turno cerrado. Se pasaron $1,615.00 a la bóveda; el cajero queda con $500.00.");
  assert.equal(mensajeCierre(500, 500), "Arqueo de cierre guardado y turno cerrado. El cajero no pasa de $500.00: no hubo retiro a la bóveda.");
  assert.equal(mensajeCierre(320, 500), "Arqueo de cierre guardado y turno cerrado. El cajero no pasa de $500.00: no hubo retiro a la bóveda.");
});
