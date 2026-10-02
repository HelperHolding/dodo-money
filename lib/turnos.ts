/** Turnos: qué pasó en cada uno (arqueos, movimientos y gastos) para revisarlo o imprimirlo. */

type TurnoHorario = { id: string; abierto_en: string; cerrado_en: string | null };

/**
 * Los gastos no guardan su turno: cuentan para el turno que estaba abierto cuando se registraron.
 * Un turno va de su apertura (incluida) a su cierre (excluido); si sigue abierto, hasta `ahora`.
 */
export function repartirGastos<G extends { creado_en: string }>(turnos: readonly TurnoHorario[], gastos: readonly G[], ahora: Date) {
  const porTurno = new Map<string, G[]>(turnos.map((t) => [t.id, []]));
  const fuera: G[] = [];
  for (const g of gastos) {
    const momento = new Date(g.creado_en).getTime();
    const turno = turnos.find((t) =>
      momento >= new Date(t.abierto_en).getTime() && momento < (t.cerrado_en ? new Date(t.cerrado_en) : ahora).getTime());
    if (turno) porTurno.get(turno.id)!.push(g);
    else fuera.push(g);
  }
  return { porTurno, fuera };
}

const centavos = (n: number) => Math.round(n * 100) / 100;
const hayDiferencia = (n: number) => Math.round(n * 100) !== 0;

export type ResumenTurno = {
  /** Diferencia del arqueo de cierre; null si el turno no se ha cerrado. */
  diferenciaCierre: number | null;
  /** Arqueos del turno (inicio, traspaso o cierre) con diferencia. */
  descuadrados: number;
  movimientos: number;
  sinConfirmar: number;
  /** Suma de movimientos confirmados por tipo. */
  confirmadoPorTipo: Record<string, number>;
  /** Merece atención: algún arqueo descuadrado o movimientos sin confirmar. */
  alerta: boolean;
};

export function resumenTurno(
  arqueos: readonly { momento: string; diferencia: number | string }[],
  movimientos: readonly { tipo: string; estado: string; monto: number | string }[],
): ResumenTurno {
  const cierre = arqueos.find((a) => a.momento === "cierre");
  const descuadrados = arqueos.filter((a) => hayDiferencia(Number(a.diferencia))).length;
  const sinConfirmar = movimientos.filter((m) => m.estado === "pendiente").length;
  const confirmadoPorTipo: Record<string, number> = {};
  for (const m of movimientos) {
    if (m.estado === "confirmado") confirmadoPorTipo[m.tipo] = centavos((confirmadoPorTipo[m.tipo] ?? 0) + Number(m.monto));
  }
  return {
    diferenciaCierre: cierre ? centavos(Number(cierre.diferencia)) : null,
    descuadrados,
    movimientos: movimientos.length,
    sinConfirmar,
    confirmadoPorTipo,
    alerta: descuadrados > 0 || sinConfirmar > 0,
  };
}

/** Totales del día: suma de diferencias de cierre, turnos sin cerrar y turnos que merecen atención. */
export function resumenDia(resumenes: readonly ResumenTurno[]) {
  return {
    diferencia: centavos(resumenes.reduce((s, r) => s + (r.diferenciaCierre ?? 0), 0)),
    turnos: resumenes.length,
    abiertos: resumenes.filter((r) => r.diferenciaCierre === null).length,
    conAlerta: resumenes.filter((r) => r.alerta).length,
  };
}
