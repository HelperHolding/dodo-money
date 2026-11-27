/**
 * Cuentas puente: dinero que salió de un lado y todavía no llega al otro.
 * Lo que entra (venta con tarjeta, recolección, lote de Rappi…) se cubre con lo que llega (depósito, recepción…) en orden
 * de llegada: primero lo más viejo. Lo que queda sin cubrir es el saldo en tránsito, con su antigüedad.
 */
export type Partida = { fecha: string; monto: number; texto: string; href?: string };
export type Pendiente = Partida & { restante: number; dias: number; atrasado: boolean };
export type CuentaPuente = {
  entradas: number; salidas: number; saldo: number; pendientes: Pendiente[];
  /** Lo que llegó de más sin una entrada que cubrir (p. ej. depósitos de ventas anteriores al periodo). */
  sobrante: number; diasMasViejo: number | null; atrasados: number;
};

const centavos = (n: number) => Math.round(n * 100);
const DIA = 86_400_000;
/** Días naturales entre dos fechas ISO (a ≤ b). */
export const diasEntre = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA));

export function cuentaPuente(entradas: readonly Partida[], salidas: readonly Partida[], hoy: string, diasNormales: number): CuentaPuente {
  const cola = [...entradas].filter((e) => centavos(e.monto) > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((e) => ({ ...e, resta: centavos(e.monto) }));
  let disponible = [...salidas].reduce((t, s) => t + centavos(s.monto), 0);
  for (const e of cola) {
    const usa = Math.min(e.resta, disponible);
    e.resta -= usa; disponible -= usa;
  }
  const pendientes = cola.filter((e) => e.resta > 0).map(({ resta, ...e }) => {
    const dias = diasEntre(e.fecha, hoy);
    return { ...e, restante: resta / 100, dias, atrasado: dias > diasNormales };
  });
  const totalEntradas = cola.reduce((t, e) => t + centavos(e.monto), 0), totalSalidas = [...salidas].reduce((t, s) => t + centavos(s.monto), 0);
  return {
    entradas: totalEntradas / 100, salidas: totalSalidas / 100,
    saldo: pendientes.reduce((t, p) => t + centavos(p.restante), 0) / 100, pendientes,
    sobrante: disponible / 100,
    diasMasViejo: pendientes.length ? Math.max(...pendientes.map((p) => p.dias)) : null,
    atrasados: pendientes.filter((p) => p.atrasado).length,
  };
}

/**
 * Lotes liquidados del reporte financiero de Rappi: neto a depositar y la fecha del último movimiento del lote.
 * Lo que aún no tiene paidlot no se ha liquidado y no está en tránsito al banco.
 */
export function lotesLiquidados(movimientos: readonly { fecha: string; lote: string | null; neto: number }[]): { lote: string; fecha: string; neto: number }[] {
  const lotes = new Map<string, { fecha: string; centavos: number }>();
  for (const m of movimientos) {
    if (!m.lote) continue;
    const l = lotes.get(m.lote) ?? { fecha: m.fecha, centavos: 0 };
    l.centavos += Math.round(Number(m.neto) * 100);
    if (m.fecha > l.fecha) l.fecha = m.fecha;
    lotes.set(m.lote, l);
  }
  return [...lotes].map(([lote, l]) => ({ lote, fecha: l.fecha, neto: l.centavos / 100 })).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.lote.localeCompare(b.lote));
}

/** Por documento (p. ej. una recolección): queda en tránsito hasta que su clave aparece entre los cubiertos (recibida). */
export function documentosEnTransito(lotes: readonly (Partida & { clave: string })[], conciliados: ReadonlySet<string>, hoy: string, diasNormales: number): CuentaPuente {
  const pendientes = lotes.filter((l) => !conciliados.has(l.clave) && centavos(l.monto) > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((l) => { const dias = diasEntre(l.fecha, hoy); return { ...l, restante: l.monto, dias, atrasado: dias > diasNormales }; });
  const suma = (xs: readonly { monto: number }[]) => xs.reduce((t, x) => t + centavos(x.monto), 0) / 100;
  const cubiertos = lotes.filter((l) => conciliados.has(l.clave));
  return {
    entradas: suma(lotes.filter((l) => centavos(l.monto) > 0)), salidas: suma(cubiertos), saldo: suma(pendientes), pendientes, sobrante: 0,
    diasMasViejo: pendientes.length ? Math.max(...pendientes.map((p) => p.dias)) : null, atrasados: pendientes.filter((p) => p.atrasado).length,
  };
}
