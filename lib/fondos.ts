/**
 * Fondos fijos del efectivo de cada sucursal:
 *   · cajón de venta: cada turno arranca con su fondo (500) y al cerrar todo lo demás va a la bóveda;
 *   · bóveda: después de la salida a corporativo se queda con su fondo (4,500, de ellos 3,000 de emergencia).
 */

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Lo que se retira del cajón a la bóveda al cerrar el turno para dejarlo con su fondo. */
export const retiroABoveda = (contado: number, fondoCajon: number) => Math.max(0, centavos(contado - fondoCajon));

export type Boveda = { saldoBoveda: number; salidasPendientes: number; fondoBoveda: number };

/** Lo que puede salir a corporativo: el saldo de la bóveda menos su fondo y menos las salidas que aún no se recogen. */
export const salidaSugerida = (b: Boveda) => Math.max(0, centavos(b.saldoBoveda - b.salidasPendientes - b.fondoBoveda));

/** null si la salida deja la bóveda con su fondo completo; si no, el mensaje con lo más que puede salir. */
export function problemaSalida(monto: number, b: Boveda): string | null {
  const queda = centavos(b.saldoBoveda - b.salidasPendientes - monto);
  if (queda >= b.fondoBoveda) return null;
  const maximo = salidaSugerida(b);
  return `Con esa salida la bóveda quedaría con ${mxn.format(queda)} y debe quedarse con ${mxn.format(b.fondoBoveda)}. `
    + (maximo > 0 ? `Lo más que puede salir es ${mxn.format(maximo)}.` : "Ahora no puede salir nada.");
}
