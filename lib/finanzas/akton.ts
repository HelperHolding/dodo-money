/**
 * P&L contra meta en el estilo Akton (docs/diseno/estilo-akton.md): indicadores, lectura numerada y renglones
 * agrupados. Solo reorganiza las filas que ya calculó calcularPL; no recalcula el resultado.
 * Aquí solo se importan tipos para que las pruebas corran sin compilar.
 */
import type { ClaveRenglon, EntradaPL, FilaPL } from "./pl";

const centavos = (n: number) => Math.round(n * 100) / 100;
const fraccion = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 10000) / 10000 : null);

/** Rango de mercado del prime cost (alimento + merma + nómina) sobre la venta neta. */
export const PRIME_COST_MERCADO = { min: 0.55, max: 0.65 } as const;

export type Indicadores = {
  ventaNeta: number; ventaBruta: number | null; descuentoPct: number | null;
  pedidos: number | null; pedidosDia: number | null;
  ticketPos: number | null; ticketRappi: number | null;
  alimentoMermaPct: number | null; alimentoMermaMetaPct: number | null;
  primeCostPct: number | null;
  ebitdaTienda: number | null; ebitdaTiendaPct: number | null; ebitdaTiendaMeta: number | null;
};

/** Los seis indicadores de la franja superior. `dias`: días del periodo con datos (para el promedio de pedidos). */
export function indicadoresAkton(entrada: EntradaPL, filas: readonly FilaPL[], dias: number): Indicadores {
  const de = new Map(filas.map((f) => [f.clave, f]));
  const monto = (c: ClaveRenglon) => de.get(c)?.monto ?? null;
  const venta = entrada.ventaNeta;
  const bruta = monto("venta_bruta");
  const pDodo = entrada.canales.dodo.pedidos, pRappi = entrada.canales.rappi.pedidos;
  const pedidos = pDodo === undefined && pRappi === undefined ? null : (pDodo ?? 0) + (pRappi ?? 0);
  const ticket = (neta: number, n: number | undefined) => (n ? centavos(neta / n) : null);
  const alimento = monto("alimento") ?? 0, merma = monto("merma") ?? 0;
  const metaAM = (de.get("alimento")?.meta ?? null) === null && (de.get("merma")?.meta ?? null) === null ? null
    : (de.get("alimento")?.meta ?? 0) + (de.get("merma")?.meta ?? 0);
  const nomina = (monto("nomina_cocina") ?? 0) + (monto("nomina_gerencia") ?? 0);
  const tienda = de.get("ebitda_tienda");
  return {
    ventaNeta: venta, ventaBruta: bruta, descuentoPct: bruta === null || bruta <= 0 ? null : fraccion(bruta - venta, bruta),
    pedidos, pedidosDia: pedidos === null || dias <= 0 ? null : Math.round((pedidos / dias) * 10) / 10,
    ticketPos: ticket(entrada.canales.dodo.neta, pDodo), ticketRappi: ticket(entrada.canales.rappi.neta, pRappi),
    alimentoMermaPct: fraccion(alimento + merma, venta), alimentoMermaMetaPct: metaAM === null ? null : fraccion(metaAM, venta),
    primeCostPct: fraccion(alimento + merma + nomina, venta),
    ebitdaTienda: tienda?.monto ?? null, ebitdaTiendaPct: tienda?.pct ?? null, ebitdaTiendaMeta: tienda?.meta ?? null,
  };
}

/** Una variación es favorable si el gasto queda abajo de su meta o el ingreso/total arriba. Sin meta: null. */
export function favorable(f: Pick<FilaPL, "tipo" | "diferencia" | "sinCapturar">, gasto = f.tipo === "gasto"): boolean | null {
  if (f.sinCapturar || f.diferencia === null || f.diferencia === 0) return null;
  return gasto ? f.diferencia < 0 : f.diferencia > 0;
}

export type Lectura = { ebitda: number | null; meta: number | null; diferencia: number | null; causas: { clave: ClaveRenglon; nombre: string; exceso: number }[] };

/** Lectura 1: EBITDA de tienda contra meta y los renglones (hasta `n`) con la mayor variación desfavorable. */
export function lecturaEbitda(filas: readonly FilaPL[], n = 3): Lectura {
  const t = filas.find((f) => f.clave === "ebitda_tienda");
  const causas = filas
    .filter((f) => f.tipo === "gasto" && f.clave !== "oficina" && !f.sinCapturar && f.diferencia !== null && f.diferencia > 0)
    .sort((a, b) => b.diferencia! - a.diferencia!)
    .slice(0, n)
    .map((f) => ({ clave: f.clave, nombre: f.nombre, exceso: f.diferencia! }));
  return { ebitda: t?.monto ?? null, meta: t?.meta ?? null, diferencia: t?.diferencia ?? null, causas };
}

/** Cómo se dibuja cada renglón de la tabla. */
export type Nivel = "seccion" | "fila" | "sub" | "subtotal" | "destacado";
export type RenglonAkton = {
  clave: string; nombre: string; nivel: Nivel;
  monto: number | null; pct: number | null; meta: number | null; metaPct: number | null; diferencia: number | null;
  favorable: boolean | null;
  /** Ingreso dentro de un grupo de gastos (se marca con un chip). */
  ingreso?: boolean;
  /** Fila original del P&L: detalle «de dónde sale», ajustes y formulario de captura. Los renglones calculados aquí no la tienen. */
  fila?: FilaPL;
};

const RAPPI_INGRESOS: readonly ClaveRenglon[] = ["rappi_fuera_base", "rappi_excedente"];
const RAPPI_GASTOS: readonly ClaveRenglon[] = ["agregadores", "rappi_ajustes", "marketing_agregadores"];
const OPERACION: readonly ClaveRenglon[] = ["nomina_cocina", "nomina_gerencia", "repartidores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "regalias", "otros"];

/**
 * Orden Akton: venta (bruta → descuentos → neta, con POS y Rappi como sub-renglones), costo de venta → margen bruto,
 * Rappi agrupado con su neto, gastos de operación → EBITDA de tienda, oficina → EBITDA.
 * `ocultar` deja fuera filas de detalle (p. ej. el desglose de nómina en cero).
 */
export function renglonesAkton(filas: readonly FilaPL[], ocultar: (f: FilaPL) => boolean = () => false): RenglonAkton[] {
  const de = new Map(filas.map((f) => [f.clave, f]));
  const out: RenglonAkton[] = [];
  const seccion = (clave: string, nombre: string) => out.push({ clave, nombre, nivel: "seccion", monto: null, pct: null, meta: null, metaPct: null, diferencia: null, favorable: null });
  const poner = (c: ClaveRenglon, nivel: Nivel, extra: Partial<RenglonAkton> = {}) => {
    const f = de.get(c);
    if (!f || ocultar(f)) return;
    out.push({ clave: f.clave, nombre: f.nombre, nivel, monto: f.monto, pct: f.pct, meta: f.meta, metaPct: f.metaPct, diferencia: f.diferencia, favorable: favorable(f), fila: f, ...extra });
  };
  const subtotal = (c: ClaveRenglon, nivel: Nivel = "subtotal") => poner(c, nivel, { favorable: favorable(de.get(c) ?? { tipo: "total", diferencia: null, sinCapturar: false }, false) });
  const pctVenta = (n: number | null) => { const v = de.get("venta_neta")?.monto ?? 0; return n === null || v <= 0 ? null : Math.round((n / v) * 10000) / 10000; };
  const restar = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || b === null || b === undefined ? null : centavos(a - b));

  seccion("s-venta", "Venta");
  poner("venta_bruta", "fila", { favorable: null });
  poner("venta_bruta_dodo", "sub", { nombre: "POS (Dodo IS)" });
  poner("venta_bruta_rappi", "sub", { nombre: "Rappi" });
  poner("descuentos_venta", "fila", { favorable: null, nombre: "Descuentos" });
  for (const [canal, nombre] of [["dodo", "POS (Dodo IS)"], ["rappi", "Rappi"]] as const) {
    const m = restar(de.get(`venta_bruta_${canal}`)?.monto, de.get(`venta_neta_${canal}`)?.monto);
    if (m !== null && de.has("descuentos_venta")) out.push({ clave: `descuentos_${canal}`, nombre, nivel: "sub", monto: m, pct: pctVenta(m), meta: null, metaPct: null, diferencia: null, favorable: null });
  }
  subtotal("venta_neta");
  poner("venta_neta_dodo", "sub", { nombre: "POS (Dodo IS)", favorable: null });
  poner("venta_neta_rappi", "sub", { nombre: "Rappi", favorable: null });

  seccion("s-costo", "Costo de venta");
  poner("alimento", "fila");
  poner("alimento_dodo", "sub", { nombre: "POS (Dodo IS)" });
  poner("alimento_rappi", "sub", { nombre: "Rappi" });
  poner("merma", "fila");
  poner("merma_productos", "sub", { nombre: "Productos terminados" });
  poner("merma_insumos", "sub", { nombre: "Insumos" });
  subtotal("margen_bruto");

  const rappi = [...RAPPI_INGRESOS, ...RAPPI_GASTOS].map((c) => de.get(c)).filter((f): f is FilaPL => !!f);
  if (rappi.some((f) => f.monto || f.meta)) {
    seccion("s-rappi", "Rappi y agregadores");
    for (const c of RAPPI_INGRESOS) if (de.get(c)?.monto) poner(c, "fila", { ingreso: true, nombre: de.get(c)!.nombre.replace(/^Rappi · /, "") });
    for (const c of RAPPI_GASTOS) poner(c, "fila", { nombre: de.get(c)!.nombre.replace(/^Rappi · /, "") });
    const signo = (f: FilaPL) => (RAPPI_INGRESOS.includes(f.clave) ? 1 : -1);
    const neto = centavos(rappi.reduce((t, f) => t + signo(f) * (f.monto ?? 0), 0));
    const conMeta = rappi.some((f) => f.meta !== null);
    const meta = conMeta ? centavos(rappi.reduce((t, f) => t + signo(f) * (f.meta ?? 0), 0)) : null;
    const diferencia = meta === null ? null : centavos(neto - meta);
    out.push({ clave: "rappi_neto", nombre: "Rappi, neto", nivel: "subtotal", monto: neto, pct: pctVenta(neto), meta, metaPct: pctVenta(meta), diferencia,
      favorable: diferencia === null || diferencia === 0 ? null : diferencia > 0 });
  }

  seccion("s-operacion", "Gastos de operación");
  for (const c of OPERACION) {
    poner(c, "fila");
    if (c === "nomina_cocina" || c === "nomina_gerencia")
      for (const f of filas) if (f.tipo === "detalle" && f.clave.startsWith(`${c}_`)) poner(f.clave, "sub");
  }
  subtotal("ebitda_tienda", "destacado");

  seccion("s-oficina", "Oficina central");
  poner("oficina", "fila");
  subtotal("ebitda");
  return out;
}

/** Notas del margen derecho: a qué renglón va cada aviso del P&L según su prefijo o contenido; el resto queda general. */
export function notasPorRenglon(avisos: readonly string[]): { porRenglon: Map<string, string[]>; generales: string[] } {
  const porRenglon = new Map<string, string[]>();
  const generales: string[] = [];
  const reglas: [RegExp, string][] = [
    [/^Mermas:/, "merma"],
    [/^Marketing:/, "marketing"],
    [/^(Rappi:|Días Rappi|Hay ventas de agregador)/, "rappi_neto"],
    [/^Nómina/, "nomina_cocina"],
    [/productos vendidos sin costo/, "alimento"],
    [/^Faltan \d+ días de ventas/, "venta_neta"],
    [/facturas sin cuenta del P&L/, "otros"],
    [/^Posible duplicado en (Renta|Servicios|Marketing|Mantenimiento|Repartidores|Otros)/, ""],
  ];
  const cuentaDuplicado: Record<string, string> = { Renta: "renta", Servicios: "servicios", Marketing: "marketing", Mantenimiento: "mantenimiento", Repartidores: "repartidores", Otros: "otros" };
  for (const a of avisos) {
    let destino: string | null = null;
    for (const [re, c] of reglas) {
      const m = a.match(re);
      if (!m) continue;
      destino = c || cuentaDuplicado[m[1]] || null;
      break;
    }
    if (destino) porRenglon.set(destino, [...(porRenglon.get(destino) ?? []), a]);
    else generales.push(a);
  }
  return { porRenglon, generales };
}
