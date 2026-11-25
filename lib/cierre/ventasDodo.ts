export type VentasDodo = {
  efectivo: number;
  tarjeta: number;
  pedidos: number;
  actualizado_en: string | null;
};

export type Comparacion = {
  efectivo: number | null;
  tarjeta: number | null;
  tarjetaComoEfectivo: boolean;
  pedidos: number | null;
};

const round = (x: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
};

const redondearCentavos = (x: number) => round(x, 2);

// IVA incluido en el total: total * 16 / 116.
export function ivaDeVenta(total: number): number {
  return round(total * 16 / 116, 2);
}

// Diferencia capturado − Dodo en centavos. Null si falta cualquiera de los dos lados.
function diferencia(capturado: number | null, dodo: number | null): number | null {
  if (capturado === null || dodo === null) return null;
  return redondearCentavos(capturado - dodo);
}

// Una diferencia cuenta solo si supera $1.00 en valor absoluto.
export function hayDiferencia(d: number | null): boolean {
  return d !== null && Math.abs(d) > 1;
}

export function compararVentas(
  capturado: { efectivo: number | null; tarjeta: number | null },
  dodo: VentasDodo | null,
): Comparacion {
  if (!dodo) {
    return { efectivo: null, tarjeta: null, tarjetaComoEfectivo: false, pedidos: null };
  }

  const efectivo = diferencia(capturado.efectivo, dodo.efectivo);
  const tarjeta = diferencia(capturado.tarjeta, dodo.tarjeta);

  // Reparto distinto entre efectivo y tarjeta pero con la misma suma total.
  let tarjetaComoEfectivo = false;
  if (efectivo !== null && tarjeta !== null) {
    const sumaCapturada = (capturado.efectivo as number) + (capturado.tarjeta as number);
    const sumaDodo = dodo.efectivo + dodo.tarjeta;
    const diferenciaSuma = redondearCentavos(sumaCapturada - sumaDodo);
    tarjetaComoEfectivo =
      Math.abs(diferenciaSuma) <= 1 && (hayDiferencia(efectivo) || hayDiferencia(tarjeta));
  }

  return { efectivo, tarjeta, tarjetaComoEfectivo, pedidos: dodo.pedidos };
}
