/** Nombres visibles de Ventas BI (filtros y gráficas). Las claves son las de `lib/ventas/bi.ts` y de `ventas_bi`. */
export const NOMBRE_PAGO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", en_linea: "En línea", rappi: "Rappi", otro: "Otro" };
export const NOMBRE_ORIGEN: Record<string, string> = {
  mostrador: "Mostrador", kiosco: "Kiosco", app: "App", sitio: "Sitio web", otro: "Otro", agregador: "Agregadores", rappi: "Rappi", centro_llamadas: "Centro de llamadas",
};
export const NOMBRE_TIPO_BI: Record<string, string> = { en_tienda: "En tienda", entrega: "Entrega", para_llevar: "Para llevar" };
export const NOMBRE_CANAL: Record<string, string> = { pos: "POS (Dodo IS)", rappi: "Rappi" };
export const NOMBRE_CATEGORIA_BI: Record<string, string> = {
  pizza: "Pizzas", snack: "Snacks", postre: "Postres", bebida: "Bebidas", combo: "Combos", otro: "Otros", sin_categoria: "Sin categoría",
};
export const NOMBRE_EDAD: Record<string, string> = { "0-6": "0–6 meses", "6-12": "6–12 meses", "12-24": "1–2 años", "24+": "Más de 2 años" };
/** ISO: 1 = lunes … 7 = domingo. */
export const NOMBRE_DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const MES_CORTO = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** Clase de color del pago: «otro» usa cat-otro-pago, porque cat-otro es el color de la categoría de producto. */
export const clavePago = (pago: string) => (pago === "otro" ? "otro-pago" : pago);
export const nombre = (mapa: Record<string, string>, clave: string) => mapa[clave] ?? clave;
/** Clase de color del origen: «otro» usa cat-otro-origen (cat-otro es de la categoría de producto). */
export const claveOrigen = (origen: string) => (origen === "otro" ? "otro-origen" : origen);
