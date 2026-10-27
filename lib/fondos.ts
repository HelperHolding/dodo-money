/**
 * Fondos fijos del efectivo de cada sucursal:
 *   · cajero: cada turno arranca con su fondo (500) y al cerrar todo lo demás pasa solo a la bóveda;
 *   · bóveda: después de la salida a corporativo se queda con su fondo (4,500).
 */

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Lo que pasa del cajero a la bóveda al cerrar el turno para dejarlo con su fondo. */
export const retiroABoveda = (contado: number, fondoCajon: number) => Math.max(0, centavos(contado - fondoCajon));

/** Mensaje al guardar el arqueo de cierre: el retiro a la bóveda ya lo registró la base (ver 0027). */
export function mensajeCierre(contado: number, fondoCajero: number): string {
  const retiro = retiroABoveda(contado, fondoCajero);
  return retiro > 0
    ? `Arqueo de cierre guardado y turno cerrado. Se pasaron ${mxn.format(retiro)} a la bóveda; el cajero queda con ${mxn.format(fondoCajero)}.`
    : `Arqueo de cierre guardado y turno cerrado. El cajero no pasa de ${mxn.format(fondoCajero)}: no hubo retiro a la bóveda.`;
}

export type Boveda = { saldoBoveda: number; salidasPendientes: number; fondoBoveda: number; reservas?: number };

/** Lo que puede salir a corporativo: el saldo de la bóveda menos su fondo y menos las salidas que aún no se recogen. */
export const salidaSugerida = (b: Boveda) => Math.max(0, centavos(b.saldoBoveda - b.salidasPendientes - b.fondoBoveda - (b.reservas ?? 0)));

/** null si la salida deja la bóveda con su fondo completo; si no, el mensaje con lo más que puede salir. */
export function problemaSalida(monto: number, b: Boveda): string | null {
  const queda = centavos(b.saldoBoveda - b.salidasPendientes - monto);
  if (queda >= b.fondoBoveda + (b.reservas ?? 0)) return null;
  const maximo = salidaSugerida(b);
  return `Con esa salida la bóveda quedaría con ${mxn.format(queda)} y debe quedarse con ${mxn.format(b.fondoBoveda)}.${b.reservas ? ` Además, hay ${mxn.format(b.reservas)} reservados para pagos.` : ""} `
    + (maximo > 0 ? `Lo más que puede salir es ${mxn.format(maximo)}.` : "Ahora no puede salir nada.");
}
