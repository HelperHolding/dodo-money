/**
 * Carga de costos desde el Excel del menú (pestaña "Costo"): leer la hoja y emparejar cada renglón con los productos
 * de Dodo IS. Costo = receta + periférico (1 % del precio: sobres de cátsup, servilletas, chile en polvo).
 * Las variantes "T" (Thin) toman el costo de su tamaño; "Mitad y mitad" es el promedio simple de los sabores de su tamaño;
 * los combos se ignoran (Dodo IS los registra como sus piezas por separado).
 */
import type { Categoria } from "./calculos";
import type { Hoja } from "./xlsx";

export const SIN_HOJA_COSTOS = "No encontré la pestaña de costos con su formato (secciones Pizza, Snacks, Soda… con su renglón de \"Categoría\").";

export type Seccion = "pizza" | "snack" | "postre" | "bebida" | "dip" | "combo";
export type Tam = "P" | "M" | "G";
export type FilaCosto = { seccion: Seccion; nombre: string; tam: Tam; receta: number; periferico: number };

const SECCIONES: Record<string, Seccion> = { pizza: "pizza", snacks: "snack", desserts: "postre", postres: "postre", soda: "bebida", bebidas: "bebida", dips: "dip", combos: "combo" };

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Para comparar nombres del Excel: sin acentos ni mayúsculas, sin lo que va entre paréntesis, espacios sencillos. */
export const claveExcel = (t: string) => sinAcentos(t).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
const claveProducto = (t: string) => sinAcentos(t).replace(/\s+/g, " ").trim();

const numero = (v: string | number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Lee la pestaña "Costo": cada sección empieza con un renglón cuyo B es "Categoría". */
export function leerHojaCostos(hoja: Hoja): { filas: FilaCosto[] } | { error: string } {
  const filas = new Map<number, Map<string, string | number>>();
  for (const [ref, v] of hoja.celdas) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    if (!filas.has(Number(m[2]))) filas.set(Number(m[2]), new Map());
    filas.get(Number(m[2]))!.set(m[1], v);
  }
  const resultado: FilaCosto[] = [];
  let seccion: Seccion | null = null;
  let secciones = 0;
  for (const n of [...filas.keys()].sort((a, b) => a - b)) {
    const f = filas.get(n)!;
    const a = f.get("A"), b = f.get("B");
    if (typeof a !== "string" || !a.trim()) continue;
    if (typeof b === "string" && sinAcentos(b).trim() === "categoria") {
      seccion = SECCIONES[sinAcentos(a).trim()] ?? null;
      if (seccion) secciones++;
      continue;
    }
    if (!seccion) continue;
    const nombre = a.trim();
    if (seccion === "combo") {
      const receta = numero(f.get("F"));
      if (receta !== null) resultado.push({ seccion, nombre, tam: "M", receta, periferico: 0 });
      continue;
    }
    // Pizza: periférico en C/D/E y costo en F/G/H (25, 30, 35 cm). Lo demás: periférico en C/D y costo en F/G (M, G).
    const tamanos: [Tam, string, string][] = seccion === "pizza" ? [["P", "C", "F"], ["M", "D", "G"], ["G", "E", "H"]] : [["M", "C", "F"], ["G", "D", "G"]];
    for (const [tam, colPer, colCosto] of tamanos) {
      const receta = numero(f.get(colCosto));
      if (receta === null) continue;
      const periferico = seccion === "bebida" || seccion === "dip" ? 0 : numero(f.get(colPer)) ?? 0;
      resultado.push({ seccion, nombre, tam, receta, periferico });
    }
  }
  if (!secciones || !resultado.length) return { error: SIN_HOJA_COSTOS };
  return { filas: resultado };
}

/** Nombres que en el Excel se escriben distinto que en Dodo IS (clave del Excel → nombre base en Dodo IS). */
const ALIAS: Record<string, string> = {
  "margherita": "Margarita", "hawaii": "Hawaiana", "4 quesos": "Quatro quesos", "cheesy cheddar": "Cheddar Cremoso",
  "jamon y champinonas": "Jamón y champiñones", "spicy ranch": "Ranch Picante", "verduras y champinonas": "Verduras y Champiñones",
  "tres carnes": "Tres Carnes", "fries": "Papas francesas", "wedges": "Papas Gajo", "dodster classic": "Dodster Classico",
  "wings": "Alitas Buffalo", "chicken pieces": "Boneless", "apple rolls": "Rolls con manzana", "coca cola": "Coca-Cola",
  "coca cola light": "Coca Light", "coca cola zero": "Coca Zero",
};

const SUFIJOS: Record<Exclude<Seccion, "combo">, Partial<Record<Tam, string[]>>> = {
  pizza: { P: ["Pequeño"], M: ["Mediano"], G: ["Grande"] },
  snack: { M: ["Medium", "Mediano", "1 pza", "10 uds", ""], G: ["Grande"] },
  postre: { M: ["8"], G: ["16"] },
  bebida: { M: ["0,6 L"], G: ["2 L", "2,5 L"] },
  dip: { M: [""] },
};

export type ProductoCatalogo = { dodo_id: number; nombre: string; categoria: Categoria | null; tamano: string | null };
export type Asignacion = {
  dodo_id: number; producto: string; excel: string; tam: Tam; costo: number;
  /** Cómo se emparejó: por nombre, por una equivalencia guardada, como variante Thin o como promedio (mitad y mitad). */
  origen: "nombre" | "equivalencia" | "thin" | "mitad";
  categoria: Categoria; tamano: string | null; nota: string;
};

const CATEGORIA: Record<Exclude<Seccion, "combo">, Categoria> = { pizza: "pizza", snack: "snack", postre: "postre", bebida: "bebida", dip: "otro" };
const TAMANO: Record<Tam, string> = { P: "pequeno", M: "mediano", G: "grande" };
const NOMBRE_TAMANO: Record<Tam, string> = { P: "Pequeño", M: "Mediano", G: "Grande" };
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Nombres posibles en Dodo IS para un renglón del Excel. */
function candidatos(f: FilaCosto): string[] {
  if (f.seccion === "combo") return [];
  const base = ALIAS[claveExcel(f.nombre)] ?? f.nombre.replace(/\([^)]*\)/g, "").trim();
  return (SUFIJOS[f.seccion][f.tam] ?? []).map((s) => (f.seccion === "dip" ? `Dip ${base} Dip` : `${base} ${s}`.trim()));
}

/**
 * Empareja los renglones del Excel con el catálogo. `guardadas`: "clave del Excel|tamaño" → dodo_id que el admin eligió antes.
 * Devuelve las asignaciones, los renglones del Excel sin producto (sin combos) y los productos que se quedan sin costo nuevo.
 */
export function emparejarCostos(filas: readonly FilaCosto[], catalogo: readonly ProductoCatalogo[], guardadas: ReadonlyMap<string, number>) {
  const porNombre = new Map(catalogo.map((p) => [claveProducto(p.nombre), p]));
  const porId = new Map(catalogo.map((p) => [p.dodo_id, p]));
  const asignaciones: Asignacion[] = [];
  const asignado = new Set<number>();
  const sinProducto: FilaCosto[] = [];
  const nota = (f: FilaCosto) => `${f.nombre} ${f.tam}: receta ${f.receta.toFixed(2)} + periférico ${f.periferico.toFixed(2)}`;
  const asignar = (p: ProductoCatalogo, f: FilaCosto, origen: Asignacion["origen"]) => {
    if (asignado.has(p.dodo_id) || f.seccion === "combo") return;
    asignado.add(p.dodo_id);
    asignaciones.push({
      dodo_id: p.dodo_id, producto: p.nombre, excel: f.nombre, tam: f.tam, costo: centavos(f.receta + f.periferico), origen,
      categoria: CATEGORIA[f.seccion], tamano: f.seccion === "pizza" ? TAMANO[f.tam] : p.tamano, nota: nota(f),
    });
  };

  // Pizzas por tamaño que sí existen en Dodo IS: de ahí sale el promedio de la mitad y mitad.
  const pizzasPorTam: Record<Tam, number[]> = { P: [], M: [], G: [] };
  for (const f of filas) {
    if (f.seccion === "combo") continue;
    const guardada = guardadas.get(`${claveExcel(f.nombre)}|${f.tam}`);
    const producto = (guardada !== undefined ? porId.get(guardada) : undefined)
      ?? candidatos(f).map((c) => porNombre.get(claveProducto(c))).find((p) => p !== undefined);
    if (!producto) { sinProducto.push(f); continue; }
    asignar(producto, f, guardada !== undefined && porId.has(guardada) ? "equivalencia" : "nombre");
    if (f.seccion === "pizza") {
      pizzasPorTam[f.tam].push(f.receta + f.periferico);
      // La variante Thin ("… Grande T") lleva el costo de su tamaño en masa normal.
      const thin = porNombre.get(claveProducto(`${producto.nombre} T`));
      if (thin) asignar(thin, f, "thin");
    }
  }
  for (const tam of ["P", "M", "G"] as const) {
    const mitad = porNombre.get(claveProducto(`Mitad y mitad ${NOMBRE_TAMANO[tam]}`));
    const sabores = pizzasPorTam[tam];
    if (!mitad || asignado.has(mitad.dodo_id) || !sabores.length) continue;
    const costo = centavos(sabores.reduce((s, c) => s + c, 0) / sabores.length);
    asignado.add(mitad.dodo_id);
    asignaciones.push({
      dodo_id: mitad.dodo_id, producto: mitad.nombre, excel: "Mitad y mitad", tam, costo, origen: "mitad", categoria: "pizza", tamano: TAMANO[tam],
      nota: `Mitad y mitad: promedio simple del costo ${NOMBRE_TAMANO[tam]} de ${sabores.length} sabores (media + media)`,
    });
  }
  return { asignaciones, sinProducto, sinCosto: catalogo.filter((p) => !asignado.has(p.dodo_id)) };
}
