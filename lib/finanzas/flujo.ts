/** Flujo de efectivo real: movimientos del banco agrupados por el concepto de su conciliación, del saldo inicial al final. */
export type SeccionFlujo = "ingresos" | "egresos" | "inversion" | "financiamiento" | "otros" | "saldos";
type Definicion = { clave: string; nombre: string; seccion: SeccionFlujo; tipo: "renglon" | "total"; opcional?: boolean };

export const RENGLONES_FLUJO: readonly Definicion[] = [
  { clave: "cobranza_tarjeta", nombre: "Cobranza tarjeta (NetPay)", seccion: "ingresos", tipo: "renglon" },
  { clave: "deposito_efectivo", nombre: "Depósitos de efectivo", seccion: "ingresos", tipo: "renglon", opcional: true },
  { clave: "cobranza_rappi", nombre: "Cobranza Rappi", seccion: "ingresos", tipo: "renglon" },
  { clave: "ingresos_operativos", nombre: "Total ingresos operativos", seccion: "ingresos", tipo: "total" },
  { clave: "proveedores", nombre: "Proveedores (alimentos y empaque)", seccion: "egresos", tipo: "renglon" },
  { clave: "nomina", nombre: "Nómina", seccion: "egresos", tipo: "renglon" },
  { clave: "imss_impuestos", nombre: "IMSS e impuestos", seccion: "egresos", tipo: "renglon" },
  { clave: "renta", nombre: "Renta", seccion: "egresos", tipo: "renglon" },
  { clave: "servicios", nombre: "Servicios", seccion: "egresos", tipo: "renglon" },
  { clave: "marketing", nombre: "Marketing", seccion: "egresos", tipo: "renglon" },
  { clave: "regalias", nombre: "Regalías", seccion: "egresos", tipo: "renglon" },
  { clave: "comisiones_cobro", nombre: "Comisiones de cobro", seccion: "egresos", tipo: "renglon" },
  { clave: "comisiones_bancarias", nombre: "Comisiones bancarias", seccion: "egresos", tipo: "renglon" },
  { clave: "otros_operacion", nombre: "Otros de operación", seccion: "egresos", tipo: "renglon" },
  { clave: "egresos_operativos", nombre: "Total egresos operativos", seccion: "egresos", tipo: "total" },
  { clave: "flujo_operacion", nombre: "Flujo de operación", seccion: "egresos", tipo: "total" },
  { clave: "capex", nombre: "CapEx", seccion: "inversion", tipo: "renglon" },
  { clave: "apertura", nombre: "Apertura y equipamiento", seccion: "inversion", tipo: "renglon", opcional: true },
  { clave: "flujo_inversion", nombre: "Flujo de inversión", seccion: "inversion", tipo: "total" },
  { clave: "flujo_antes_financiamiento", nombre: "Flujo antes de financiamiento", seccion: "inversion", tipo: "total" },
  { clave: "prestamo_recibido", nombre: "Préstamo recibido", seccion: "financiamiento", tipo: "renglon" },
  { clave: "pago_capital", nombre: "Pago de capital", seccion: "financiamiento", tipo: "renglon", opcional: true },
  { clave: "intereses", nombre: "Intereses", seccion: "financiamiento", tipo: "renglon", opcional: true },
  { clave: "flujo_financiamiento", nombre: "Flujo de financiamiento", seccion: "financiamiento", tipo: "total" },
  { clave: "traspaso_interno", nombre: "Traspasos entre cuentas propias", seccion: "otros", tipo: "renglon", opcional: true },
  { clave: "por_conciliar_entradas", nombre: "Por conciliar · entradas", seccion: "otros", tipo: "renglon", opcional: true },
  { clave: "por_conciliar_salidas", nombre: "Por conciliar · salidas", seccion: "otros", tipo: "renglon", opcional: true },
  { clave: "flujo_neto", nombre: "Flujo neto", seccion: "otros", tipo: "total" },
  { clave: "saldo_inicial", nombre: "Saldo inicial", seccion: "saldos", tipo: "total" },
  { clave: "saldo_final", nombre: "Saldo final", seccion: "saldos", tipo: "total" },
];

export const SECCIONES_FLUJO: readonly { clave: SeccionFlujo; nombre: string; fondo: string; css: string }[] = [
  { clave: "ingresos", nombre: "Flujo de operación · ingresos", fondo: "BDD7EE", css: "pl-venta" },
  { clave: "egresos", nombre: "Flujo de operación · egresos", fondo: "FCE4D6", css: "pl-operacion" },
  { clave: "inversion", nombre: "Flujo de inversión", fondo: "D9EAD3", css: "pl-costo" },
  { clave: "financiamiento", nombre: "Flujo de financiamiento", fondo: "EAD1DC", css: "pl-oficina" },
  { clave: "otros", nombre: "Otros movimientos", fondo: "F2F2F2", css: "pl-memo" },
  { clave: "saldos", nombre: "Saldos del banco", fondo: "F2F2F2", css: "pl-memo" },
];

export type MovimientoFlujo = {
  cuentaId: string; fecha: string; fila: number; cargo: number; abono: number;
  /** Saldo del banco después del movimiento. */
  saldo: number;
  conciliacion: { tipo: string; concepto: string } | null;
};
export type SaldoPrevio = { cuentaId: string; saldo: number };
export type RenglonFlujo = Definicion & { monto: number; pct: number | null };
export type Flujo = {
  renglones: RenglonFlujo[]; saldoInicial: number; saldoFinal: number;
  /** Saldo final − (saldo inicial + flujo neto): distinto de 0 si hay huecos en los reportes importados. */
  diferencia: number;
  porConciliar: { n: number; entradas: number; salidas: number };
  ultimaFecha: string | null;
};

const c = (n: number) => Math.round(n * 100) / 100;
const CONCEPTOS = new Set(RENGLONES_FLUJO.filter((r) => r.tipo === "renglon" && !r.clave.startsWith("por_conciliar")).map((r) => r.clave));

/** Renglón de un movimiento: sin conciliación → por conciliar; en un cobro con tarjeta, abonos a cobranza y cargos a comisiones. */
export function claveDe(m: MovimientoFlujo): string {
  if (!m.conciliacion) return m.abono > 0 ? "por_conciliar_entradas" : "por_conciliar_salidas";
  if (m.conciliacion.tipo === "cobro_tarjeta") return m.abono > 0 ? "cobranza_tarjeta" : "comisiones_cobro";
  return CONCEPTOS.has(m.conciliacion.concepto) ? m.conciliacion.concepto : "otros_operacion";
}

/** Flujo de un periodo. `previos`: saldo de cada cuenta antes del periodo (para las cuentas sin movimientos en él). */
export function calcularFlujo(movs: readonly MovimientoFlujo[], previos: readonly SaldoPrevio[] = []): Flujo {
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila);
  const montos = new Map<string, number>();
  for (const m of orden) { const k = claveDe(m); montos.set(k, c((montos.get(k) ?? 0) + m.abono - m.cargo)); }
  const monto = (k: string) => montos.get(k) ?? 0;
  const suma = (s: SeccionFlujo) => c(RENGLONES_FLUJO.filter((r) => r.seccion === s && r.tipo === "renglon").reduce((t, r) => t + monto(r.clave), 0));
  const ingresos = suma("ingresos"), egresos = suma("egresos"), operacion = c(ingresos + egresos), inversion = suma("inversion");
  const antes = c(operacion + inversion), financiamiento = suma("financiamiento"), neto = c(antes + financiamiento + suma("otros"));

  let inicial = 0, final = 0;
  for (const id of new Set([...previos.map((p) => p.cuentaId), ...orden.map((m) => m.cuentaId)])) {
    const ms = orden.filter((m) => m.cuentaId === id);
    const p = previos.find((x) => x.cuentaId === id);
    if (ms.length) { inicial += p ? p.saldo : ms[0].saldo - ms[0].abono + ms[0].cargo; final += ms[ms.length - 1].saldo; }
    else if (p) { inicial += p.saldo; final += p.saldo; }
  }
  inicial = c(inicial); final = c(final);
  const totales: Record<string, number> = {
    ingresos_operativos: ingresos, egresos_operativos: egresos, flujo_operacion: operacion, flujo_inversion: inversion,
    flujo_antes_financiamiento: antes, flujo_financiamiento: financiamiento, flujo_neto: neto, saldo_inicial: inicial, saldo_final: final,
  };
  const renglones = RENGLONES_FLUJO.map((r) => {
    const m = r.tipo === "total" ? totales[r.clave] : monto(r.clave);
    return { ...r, monto: m, pct: r.seccion === "saldos" || !ingresos ? null : m / ingresos };
  });
  return {
    renglones, saldoInicial: inicial, saldoFinal: final, diferencia: c(final - (inicial + neto)),
    porConciliar: { n: orden.filter((m) => !m.conciliacion).length, entradas: monto("por_conciliar_entradas"), salidas: monto("por_conciliar_salidas") },
    ultimaFecha: orden.length ? orden[orden.length - 1].fecha : null,
  };
}

/** Copia del flujo con otros saldos inicial y final (p. ej. el total del año: inicial del primer mes, final del último). */
export function conSaldos(f: Flujo, inicial: number, final: number): Flujo {
  const neto = f.renglones.find((r) => r.clave === "flujo_neto")?.monto ?? 0;
  const monto = (k: string, m: number) => (k === "saldo_inicial" ? inicial : k === "saldo_final" ? final : m);
  return { ...f, renglones: f.renglones.map((r) => ({ ...r, monto: monto(r.clave, r.monto) })), saldoInicial: inicial, saldoFinal: final, diferencia: c(final - (inicial + neto)) };
}

/** Un flujo por periodo consecutivo; el saldo de cada cuenta se arrastra al siguiente. */
export function flujoPorMes(movs: readonly MovimientoFlujo[], previos: readonly SaldoPrevio[], meses: readonly { desde: string; hasta: string }[]): Flujo[] {
  const saldos = new Map(previos.map((p) => [p.cuentaId, p.saldo]));
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila);
  return meses.map((r) => {
    const ms = orden.filter((m) => m.fecha >= r.desde && m.fecha <= r.hasta);
    const f = calcularFlujo(ms, [...saldos].map(([cuentaId, saldo]) => ({ cuentaId, saldo })));
    for (const m of ms) saldos.set(m.cuentaId, m.saldo);
    return f;
  });
}

/** Claves a mostrar: todo lo no opcional, y lo opcional con monto en alguna columna. */
export const visibles = (flujos: readonly Flujo[]) => new Set(RENGLONES_FLUJO
  .filter((r) => !r.opcional || flujos.some((f) => f.renglones.some((x) => x.clave === r.clave && x.monto !== 0)))
  .map((r) => r.clave));
