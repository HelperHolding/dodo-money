/** Cálculos del tablero de Ventas: indicadores contra el periodo anterior, dona y rótulos de las barras. */

/** Cambio como fracción contra el anterior (0.1 = +10 %); null si no hay anterior o era cero. */
export function cambioRelativo(actual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null;
  return limpiarCero((actual - anterior) / anterior);
}

/** Evita que un "sin cambio" salga como 0.0000000001 por redondeo. */
const limpiarCero = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);

export type ResumenPeriodo = { total: number; pedidos: number; ticket: number | null; costoPct: number | null };

export type Indicador = {
  clave: "venta" | "pedidos" | "ticket" | "costo";
  etiqueta: string;
  valor: number | null;
  /** Fracción para venta, pedidos y ticket; puntos porcentuales para el costo. */
  cambio: number | null;
  unidad: "fraccion" | "puntos";
  /** true si el cambio es bueno para el negocio, false si es malo, null si no hay cambio o comparación. */
  favorable: boolean | null;
};

const favorable = (cambio: number | null, subirEsBueno: boolean) =>
  cambio === null || cambio === 0 ? null : (cambio > 0) === subirEsBueno;

/** Los cuatro números de arriba del tablero, cada uno contra el periodo anterior del mismo largo. */
export function indicadores(actual: ResumenPeriodo, anterior: ResumenPeriodo | null): Indicador[] {
  const relativo = (clave: "venta" | "pedidos" | "ticket", etiqueta: string, valor: number | null, previo: number | null | undefined): Indicador => {
    const cambio = valor === null ? null : cambioRelativo(valor, previo ?? null);
    return { clave, etiqueta, valor, cambio, unidad: "fraccion", favorable: favorable(cambio, true) };
  };
  const puntos = actual.costoPct !== null && anterior?.costoPct != null ? limpiarCero((actual.costoPct - anterior.costoPct) * 100) : null;
  return [
    relativo("venta", "Venta total", actual.total, anterior?.total),
    relativo("pedidos", "Pedidos", actual.pedidos, anterior?.pedidos),
    relativo("ticket", "Ticket promedio", actual.ticket, anterior?.ticket),
    { clave: "costo", etiqueta: "Costo teórico", valor: actual.costoPct, cambio: puntos, unidad: "puntos", favorable: favorable(puntos, false) },
  ];
}

export type Rebanada = { clave: string; fraccion: number; inicio: number };

/** Rebanadas de la dona en el orden dado: fracción del total y dónde empieza cada una (0 a 1). Sin rebanadas vacías. */
export function rebanadasDona(valores: readonly { clave: string; valor: number }[]): Rebanada[] {
  const total = valores.reduce((s, v) => s + Math.max(0, v.valor), 0);
  if (total <= 0) return [];
  let inicio = 0;
  return valores.filter((v) => v.valor > 0).map((v) => {
    const r = { clave: v.clave, fraccion: v.valor / total, inicio };
    inicio += r.fraccion;
    return r;
  });
}

/** Qué días de la gráfica llevan rótulo: todos hasta 7; con más, unos 7 repartidos y siempre el último. */
export function diasConEtiqueta(n: number): boolean[] {
  if (n <= 7) return Array.from({ length: n }, () => true);
  const paso = Math.ceil(n / 7);
  const rotulos = Array.from({ length: n }, (_, i) => i % paso === 0);
  // El último siempre; si queda pegado al rótulo anterior, se quita ese.
  const anterior = rotulos.lastIndexOf(true, n - 2);
  if (anterior >= 0 && n - 1 - anterior < paso / 2) rotulos[anterior] = false;
  rotulos[n - 1] = true;
  return rotulos;
}
