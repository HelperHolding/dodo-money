/**
 * Inventario: existencias de insumos de Dodo IS (`/accounting/inventory-stocks`, "Warehouse balances") y artículos
 * propios (uniformes del almacén). Puro, sin red.
 * Docs: https://docs.dodois.io/docs/english-documentation/u4g3vpceyccao-accounting-warehouse-balances
 */
export type ExistenciaApi = {
  id: string; name: string; unitId: string; categoryName: string; quantity: number; measurementUnit: string;
  balanceInMoney: number; currency: string; avgWeekdayExpense: number; avgWeekendExpense: number;
  daysUntilBalanceRunsOut: number; calculatedAt: string; isConfirmed: boolean;
};

export type Existencia = {
  insumoId: string; nombre: string; sucursalId: string; categoria: Categoria; cantidad: number; unidad: string;
  valor: number; consumoDia: number; dias: number; calculado: string; confirmado: boolean;
};

export const CATEGORIAS = {
  Ingredient: "Ingredientes", SemiFinishedProduct: "Semiterminados", FinishedProduct: "Productos terminados", Packing: "Empaque",
} as const;
export type Categoria = keyof typeof CATEGORIAS | "Otro";
export const nombreCategoria = (c: Categoria) => (c === "Otro" ? "Otros" : CATEGORIAS[c]);

const UNIDAD: Record<string, string> = { kilogram: "kg", gram: "g", quantity: "pza", liter: "l", meter: "m" };
/** Días que alcanza el insumo por debajo de los cuales se marca para pedir. */
export const DIAS_ALERTA = 2;

const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/** Respuesta de la API → existencias de las sucursales ligadas (las unidades ajenas se ignoran). Ids en mayúsculas. */
export function traducirExistencias(items: readonly ExistenciaApi[], sucursalDeUnidad: ReadonlyMap<string, string>): Existencia[] {
  const unidad = new Map([...sucursalDeUnidad].map(([u, s]) => [u.toLowerCase(), s]));
  const fuera: Existencia[] = [];
  for (const x of items) {
    const sucursalId = unidad.get((x.unitId ?? "").toLowerCase());
    if (!sucursalId || !x.id) continue;
    const categoria = (x.categoryName in CATEGORIAS ? x.categoryName : "Otro") as Categoria;
    // Promedio semanal: 5 días entre semana y 2 de fin de semana.
    const consumoDia = (num(x.avgWeekdayExpense) * 5 + num(x.avgWeekendExpense) * 2) / 7;
    fuera.push({
      insumoId: x.id.toUpperCase(), nombre: (x.name ?? "").trim() || "Sin nombre", sucursalId, categoria,
      cantidad: Math.round(num(x.quantity) * 1000) / 1000,
      unidad: UNIDAD[(x.measurementUnit ?? "").toLowerCase()] ?? x.measurementUnit ?? "",
      valor: Math.round(num(x.balanceInMoney) * 100) / 100, consumoDia: Math.round(consumoDia * 1000) / 1000,
      dias: Math.max(0, Math.trunc(num(x.daysUntilBalanceRunsOut))), calculado: (x.calculatedAt ?? "").slice(0, 16),
      confirmado: x.isConfirmed === true,
    });
  }
  return fuera.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Por debajo del umbral y con consumo: se acaba pronto. Sin consumo no se alerta (no se usa). */
export const porAcabarse = (e: Pick<Existencia, "dias" | "consumoDia">) => e.consumoDia > 0 && e.dias <= DIAS_ALERTA;

export type FiltroExistencias = { sucursal?: string; categoria?: string; q?: string; alerta?: boolean };

export function filtrarExistencias(lista: readonly Existencia[], f: FiltroExistencias): Existencia[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return lista.filter((e) => (!f.sucursal || e.sucursalId === f.sucursal) && (!f.categoria || e.categoria === f.categoria)
    && (!q || e.nombre.toLowerCase().includes(q)) && (!f.alerta || porAcabarse(e)));
}

/** Grupos por categoría, en el orden de Dodo IS (ingredientes primero), con su valor total. */
export function agruparPorCategoria(lista: readonly Existencia[]) {
  const orden: Categoria[] = [...(Object.keys(CATEGORIAS) as Categoria[]), "Otro"];
  return orden.map((categoria) => {
    const items = lista.filter((e) => e.categoria === categoria);
    return { categoria, nombre: nombreCategoria(categoria), items, valor: Math.round(items.reduce((s, e) => s + e.valor, 0) * 100) / 100 };
  }).filter((g) => g.items.length);
}

/** "12.5 kg", "3 pza": sin ceros sobrantes, hasta 3 decimales. */
export const cantidadTexto = (n: number, unidad: string) =>
  `${n.toLocaleString("es-MX", { maximumFractionDigits: 3 })}${unidad ? ` ${unidad}` : ""}`;

// ——— Artículos propios (uniformes del almacén) ———

export type ArticuloInventario = {
  sku: string; nombre: string; grupo: string; cantidad: number; zoho_item_id: string | null;
  actualizado_en: string; perfiles?: { nombre: string } | null;
};

/** Cantidad capturada: entero de 0 a 100 000. null si no es válida. */
export function cantidadValida(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n <= 100_000 ? n : null;
}

/** Talla al final del nombre ("PLAYERA GRIS CUELLO MAO XG DODO" → XG) para ordenar CH, M, G, XG. */
const TALLAS = ["CH", "M", "G", "XG"];
export function ordenarArticulos<T extends Pick<ArticuloInventario, "nombre" | "sku">>(lista: readonly T[]): T[] {
  const base = (n: string) => n.replace(/\b(CH|M|G|XG)\b/, "").replace(/\s+/g, " ").trim();
  const talla = (n: string) => { const m = n.match(/\b(CH|M|G|XG)\b/); return m ? TALLAS.indexOf(m[1]) : -1; };
  return [...lista].sort((a, b) => base(a.nombre).localeCompare(base(b.nombre), "es") || talla(a.nombre) - talla(b.nombre) || a.sku.localeCompare(b.sku));
}
