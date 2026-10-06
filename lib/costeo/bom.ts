import type { Hoja } from "../ventas/xlsx.ts";

export type Material = { nombre: string; cantidad: number | null; unidad: "g" | "pieza" | null; precio: number | null; importe: number | null; porciones: number | null; medida: string; referencia: string };
export type Receta = { clave: string; nombre: string; hoja: string; referencia: string; categoria: "pizza" | "snack" | "postre"; tamano: string | null; precioVenta: number | null; costo: number | null; materiales: Material[]; avisos: string[] };
export type Insumo = { nombre: string; precio: number | null; unidad: "kg" | "pieza" | null; medida: string; merma: number | null; referencia: string; avisos: string[] };
export type ModeloBOM = { insumos: Insumo[]; recetas: Receta[]; preparaciones: { nombre: string; rendimiento: number; costo: number; materiales: Material[] }[]; avisos: string[] };
export const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/🚨/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const texto = (v: unknown) => typeof v === "string" && !v.startsWith("#") ? v.trim() : "";
const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** UC Mexico: usa los rangos de SUMIF del propio libro; no adivina los bloques por tamaño ni mezcla plantillas. */
export function leerBOM(hojas: readonly Hoja[]): ModeloBOM {
  const ingredientes = hojas.find(h => normalizar(h.nombre) === "ingredients" && !h.oculta);
  if (!ingredientes || ingredientes.celdas.get("A2") !== "INGREDIENT NAME" || ingredientes.celdas.get("G2") !== "PRICE/KG") throw new Error("No encontré ingredients con el formato de UC Mexico.");
  const recetas: Receta[] = [], unidades = new Map<string, Set<"kg" | "pieza">>();
  const insumos: Insumo[] = [];
  for (let n = 3; n <= 1000; n++) {
    const nombre = texto(ingredientes.celdas.get(`A${n}`));
    if (!nombre || nombre === "-") continue;
    const precio = num(ingredientes.celdas.get(`G${n}`));
    const merma = ingredientes.celdas.get(`F${n}`);
    insumos.push({ nombre, precio, unidad: null, medida: texto(ingredientes.celdas.get(`H${n}`)), merma: typeof merma === "number" && Number.isFinite(merma) ? merma : null, referencia: `ingredients!G${n}`, avisos: precio === null ? ["Sin precio"] : precio === 0 ? ["Precio cero en el Excel"] : [] });
  }
  const porNombre = new Map(insumos.map(i => [normalizar(i.nombre), i]));
  const registro = hojas.find(h => normalizar(h.nombre) === "registry" && !h.oculta);
  const preciosVenta = new Map<string, number>();
  if (registro) for (let n=4;n<=1000;n++) {
    const nombre=texto(registro.celdas.get(`C${n}`)), precio=num(registro.celdas.get(`D${n}`));
    if (nombre && precio !== null && precio>0) preciosVenta.set(normalizar(nombre),precio);
  }
  for (const h of hojas) {
    if (h.oculta || normalizar(h.nombre) === "template" || h.celdas.get("C10") !== "Ingredient") continue;
    for (let n = 4; n <= 8; n++) {
      const nombre = texto(h.celdas.get(`C${n}`));
      if (!nombre || nombre === "TEMPLATE") continue;
      const formula = h.formulas?.get(`E${n}`) ?? "";
      const rango = /^=?SUMIF\(\$?I\$?(\d+):\$?I\$?(\d+),\s*">0"\)$/i.exec(formula);
      const materiales: Material[] = [], avisos: string[] = [];
      if (!rango) avisos.push(`Fórmula de costo no reconocida en E${n}`);
      if (rango) {
        const desde = Number(rango[1]), hasta = Number(rango[2]);
        if (hasta < desde || hasta - desde > 100) throw new Error(`Rango de materiales inválido en ${h.nombre}!E${n}`);
        for (let r = desde; r <= hasta; r++) {
          const material = texto(h.celdas.get(`C${r}`));
          if (!material) continue;
          const f = h.formulas?.get(`I${r}`) ?? "";
          // Hay filas rotuladas Piece (masa) que se calculan por kg; la fórmula define la unidad real.
          const unidad = /\/\s*1000\s*$/.test(f) ? "g" : /^=?H\d+\*G\d+$/i.test(f) ? "pieza" : null;
          const cantidad = num(h.celdas.get(`G${r}`)), precio = num(h.celdas.get(`H${r}`)), importe = num(h.celdas.get(`I${r}`));
          materiales.push({ nombre: material, cantidad, unidad, precio, importe, porciones: num(h.celdas.get(`E${r}`)), medida: texto(h.celdas.get(`D${r}`)), referencia: `${h.nombre}!I${r}` });
          if (cantidad === null || precio === null || importe === null || !unidad) avisos.push(`${material}: cantidad, precio o unidad sin resolver (${h.nombre}!I${r})`);
          else {
            if (Math.abs(cantidad * precio / (unidad === "g" ? 1000 : 1) - importe) > .011) avisos.push(`${material}: el importe no coincide con cantidad × precio`);
            if (precio === 0 && cantidad > 0) avisos.push(`${material}: precio cero`);
            const insumo = porNombre.get(normalizar(material));
            if (!insumo) avisos.push(`${material}: no existe en ingredients`);
            else if (insumo.precio === null || Math.abs(insumo.precio - precio) > .0001) avisos.push(`${material}: el precio de la receta difiere de ingredients`);
            const us = unidades.get(normalizar(material)) ?? new Set<"kg" | "pieza">();
            us.add(unidad === "g" ? "kg" : "pieza"); unidades.set(normalizar(material), us);
          }
        }
      }
      if (!materiales.length) avisos.push("Sin materiales");
      const suma = materiales.reduce((s, m) => s + (m.importe ?? 0), 0), total = num(h.celdas.get(`E${n}`));
      if (total === null || Math.abs(suma - total) > .02) avisos.push("El total de la receta no cuadra con sus materiales");
      const pizza = /\s(25|30|35)[TТ]?\s*$/i.exec(nombre);
      // Registry D es venta directa; algunas recetas apuntan por error a E (precio de agregador).
      recetas.push({ clave: `${normalizar(h.nombre)}|${n}`, nombre, hoja: h.nombre, referencia: `${h.nombre}!E${n}`, categoria: pizza ? "pizza" : normalizar(h.nombre) === "rolls" ? "postre" : "snack", tamano: pizza ? ({25:"pequeno",30:"mediano",35:"grande"} as Record<string,string>)[pizza[1]] : null, precioVenta: preciosVenta.get(normalizar(nombre)) ?? (registro ? null : num(h.celdas.get(`D${n}`))), costo: avisos.length ? null : redondear(suma), materiales, avisos: [...new Set(avisos)] });
    }
  }
  for (const i of insumos) {
    const usadas = unidades.get(normalizar(i.nombre));
    i.unidad = usadas?.size === 1 ? [...usadas][0] : normalizar(i.medida) === "piece" ? "pieza" : null;
    if (usadas && usadas.size > 1) i.avisos.push("Se usa con unidades distintas en las recetas");
    if (!i.unidad) i.avisos.push("Unidad de precio pendiente de confirmar");
  }
  const preparaciones: ModeloBOM["preparaciones"] = [];
  for (const nombre of ["dough", "chimichurri"]) {
    const h = hojas.find(s => normalizar(s.nombre) === nombre && !s.oculta);
    if (!h) continue;
    const materiales: Material[] = [];
    for (let r = 3; r <= 8; r++) {
      const m = texto(h.celdas.get(`E${r}`));
      if (!m) continue;
      materiales.push({ nombre: m, cantidad: num(h.celdas.get(`F${r}`)), unidad: "g", precio: num(h.celdas.get(`G${r}`)), importe: num(h.celdas.get(`H${r}`)), medida: "g", porciones: null, referencia: `${h.nombre}!H${r}` });
    }
    const rendimiento = num(h.celdas.get("F10")), costo = num(h.celdas.get("H10"));
    if (rendimiento && costo !== null) preparaciones.push({ nombre: nombre === "dough" ? "Masa" : "Chimichurri", rendimiento, costo, materiales });
  }
  if (!recetas.length) throw new Error("No encontré listas de materiales con su fórmula de costo en UC Mexico.");
  return { insumos, recetas, preparaciones, avisos: [`${hojas.filter(h => h.oculta).length} pestañas ocultas excluidas.`, "Cantidades y precios leídos del Excel; sus cantidades ya incluyen los ajustes de merma. No se aplica otra merma."] };
}

const ALIAS: Record<string,string> = { margherita:"margarita", hawai:"hawaiana", "jamon y champinonas":"jamon y champinones", "verduras y champinonas":"verduras y champinones", "cheesy cheddar":"cheddar cremoso", "spicy ranch":"ranch picante", "fries m":"papas francesas medium", "fries g":"papas francesas grande", "wedges m":"papas gajo medium", "wedges g":"papas gajo grande", "dodster classic":"dodster classico 1 pza", "wings":"alitas buffalo 10 uds", "chicken pieces":"boneless medium", "apple rolls m":"rolls con manzana 8", "apple rolls g":"rolls con manzana 16" };
export function nombreDodo(nombre: string): string {
  const n = normalizar(nombre), p = /^(.*?)\s(25|30|35)([tт]?)$/.exec(n);
  if (!p) return ALIAS[n] ?? n;
  return `${ALIAS[p[1]] ?? p[1]} ${{25:"pequeno",30:"mediano",35:"grande"}[p[2] as "25"|"30"|"35"]}${p[3] ? " t" : ""}`;
}
export function emparejarBOM(recetas: readonly Receta[], catalogo: readonly {dodo_id:number;nombre:string}[], manuales: ReadonlyMap<string,number>) {
  return recetas.map(r => {
    const id = manuales.get(r.clave);
    const candidatos = id === undefined ? catalogo.filter(p => normalizar(p.nombre) === nombreDodo(r.nombre)) : catalogo.filter(p => p.dodo_id === id);
    return { ...r, dodo_id: candidatos.length === 1 ? candidatos[0].dodo_id : null, producto: candidatos.length === 1 ? candidatos[0].nombre : null };
  });
}
