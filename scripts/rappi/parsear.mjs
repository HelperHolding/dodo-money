// Convierte el texto visible del detalle de una orden del Portal Aliados en el formato de /api/rappi/importar.
// No conserva nombres de cliente ni repartidor.
const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };
const ESTADOS = ["Finalizado", "Cancelado", "Con reclamo"];
const centavos = (n) => Math.round(n * 100) / 100;

/** "$1,386" → 1386; "$ 65,00" → 65; "-$40" → 40; "-" o "—" → 0. */
export function monto(s) {
  const t = String(s).replace(/[\s$-]/g, "").replace(/—/g, "");
  if (!t) return 0;
  const n = Number(/,\d{2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  if (!Number.isFinite(n)) throw Error(`Monto ilegible: ${s}`);
  return n;
}
const esMonto = (l) => /^-?\$\s?[\d.,]+$/.test(l) || l === "—" || l === "-";
function despues(lineas, etiqueta) {
  const i = lineas.indexOf(etiqueta);
  if (i < 0 || i + 1 >= lineas.length) throw Error(`Falta "${etiqueta}" en el detalle.`);
  return lineas[i + 1];
}

/**
 * @param {string} texto innerText de la página de detalle
 * @param {string} tienda ID de tienda, p. ej. MX1930486109
 * @param {object} [datos] JSON del detalle que carga el portal (orders/partner/status/v2); trae los montos con centavos.
 * @returns {{orden: object, productos: object[], avisos: string[]}}
 */
export function parsearDetalle(texto, tienda, datos = null) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const avisos = [];
  const id = /^Orden #(\d{5,20})$/.exec(lineas.find((l) => /^Orden #\d+$/.test(l)) ?? "")?.[1];
  if (!id) throw Error("No se encontró el número de orden.");
  const estado = lineas.find((l) => ESTADOS.includes(l));
  if (!estado) throw Error(`Orden ${id}: estado no soportado (solo ${ESTADOS.join(", ")}).`);
  const iFecha = lineas.findIndex((l) => /^\d{1,2} [a-z]{3,4}\.? \d{4}$/i.test(l));
  if (iFecha < 0) throw Error(`Orden ${id}: falta la fecha.`);
  const [dia, mes, anio] = lineas[iFecha].replace(".", "").split(" ");
  const m = MESES[mes.toLowerCase()];
  if (!m) throw Error(`Orden ${id}: mes desconocido "${mes}".`);
  const fecha = `${anio}-${String(m).padStart(2, "0")}-${dia.padStart(2, "0")}`;
  const hora = /^\d{1,2}:\d{2}$/.test(lineas[iFecha + 1] ?? "") ? lineas[iFecha + 1].padStart(5, "0") : null;
  if (!hora) throw Error(`Orden ${id}: falta la hora.`);

  // Productos: "1x" / nombre / "$165", seguidos de grupos "ENCABEZADO" / "1x opción" / "$ 30,00" o "—".
  // Las canceladas no traen la sección de descuentos: el listado termina en el primer resumen que aparezca.
  const inicio = lineas.indexOf("Listado de productos");
  const fin = Math.min(...["Descuentos", "Subtotal restaurante", "Total sugerido a facturar"].map((e) => lineas.indexOf(e, inicio + 1)).filter((i) => i > 0));
  if (inicio < 0 || !Number.isFinite(fin)) throw Error(`Orden ${id}: falta el listado de productos.`);
  const bloque = lineas.slice(inicio + 1, fin), productos = [];
  for (let i = 0; i < bloque.length; i++) {
    const cant = /^(\d+)x$/.exec(bloque[i]);
    if (cant && bloque[i + 1] && esMonto(bloque[i + 2] ?? "")) {
      productos.push({ rappi_id: id, linea: productos.length + 1, nombre: bloque[i + 1], opciones: [], cantidad: Number(cant[1]), importe: monto(bloque[i + 2]) });
      i += 2;
      continue;
    }
    const opcion = /^(\d+)x (.+)$/.exec(bloque[i]);
    if (opcion && productos.length) productos.at(-1).opciones.push(opcion[1] === "1" ? opcion[2] : `${opcion[1]}x ${opcion[2]}`);
  }
  if (!productos.length) throw Error(`Orden ${id}: no se leyeron productos.`);
  // Mismo separador que las importaciones previas: la clave del producto depende del texto de las opciones.
  for (const p of productos) p.opciones = p.opciones.join(" · ");
  const pago = despues(lineas, "Método de pago:");
  const salida = (montos) => ({ orden: { rappi_id: id, tienda_id: tienda, fecha, hora, estado, pago, ...montos }, productos, avisos });

  const exactos = montosExactos(datos);
  if (exactos) {
    const suma = centavos(productos.reduce((s, p) => s + p.importe, 0));
    if (suma !== exactos.bruto) throw Error(`Orden ${id}: los renglones suman ${suma} y Rappi reporta ${exactos.bruto}.`);
    if (centavos(exactos.bruto - exactos.descuento_restaurante) !== exactos.subtotal_restaurante || centavos(exactos.subtotal_restaurante - exactos.descuento_rappi) !== exactos.facturar)
      throw Error(`Orden ${id}: los montos de Rappi no cuadran (${JSON.stringify(exactos)}).`);
    return salida(exactos);
  }
  avisos.push(`Orden ${id}: sin montos exactos de Rappi; se usan los redondeados de la página.`);

  let bruto = centavos(productos.reduce((s, p) => s + p.importe, 0));
  const facturar = monto(despues(lineas, "Total sugerido a facturar"));
  const opcional = (e) => (lineas.includes(e) ? monto(despues(lineas, e)) : null);
  const descRest = opcional("Descuento por restaurante") ?? 0, descRappi = opcional("Descuento por Rappi") ?? 0;
  const subtotal = opcional("Subtotal restaurante") ?? centavos(bruto - descRest);
  // Si el portal muestra precio unitario, el renglón es cantidad × precio.
  if (centavos(bruto - descRest) !== subtotal) {
    const porCantidad = centavos(productos.reduce((s, p) => s + p.importe * p.cantidad, 0));
    if (centavos(porCantidad - descRest) === subtotal) { for (const p of productos) p.importe = centavos(p.importe * p.cantidad); bruto = porCantidad; }
  }
  // El portal redondea a pesos; se ajustan los descuentos para que cuadren con subtotal y total mostrados.
  const descuento_restaurante = centavos(bruto - subtotal), descuento_rappi = centavos(subtotal - facturar);
  if (descuento_restaurante !== descRest) avisos.push(`Orden ${id}: descuento restaurante ${descRest} → ${descuento_restaurante} para cuadrar.`);
  if (descuento_rappi !== descRappi) avisos.push(`Orden ${id}: descuento Rappi ${descRappi} → ${descuento_rappi} para cuadrar.`);
  if (descuento_restaurante < 0 || descuento_rappi < 0) throw Error(`Orden ${id}: los montos no cuadran (productos ${bruto}, subtotal ${subtotal}, total ${facturar}).`);

  return salida({ bruto, descuento_restaurante, subtotal_restaurante: subtotal, descuento_rappi, facturar });
}

/** Montos con centavos de order_totals: subtotal, discounts_partner_store, subtotal_rest, discounts_rappi y suggested_total. */
export function montosExactos(datos) {
  const t = datos?.order_totals;
  if (!t || !Array.isArray(t.details) || typeof t.total?.value !== "number") return null;
  const v = (id) => { const d = t.details.find((x) => x?.id === id); return typeof d?.value === "number" ? centavos(Math.abs(d.value)) : null; };
  const bruto = v("subtotal");
  if (bruto === null) return null;
  const descuento_restaurante = v("discounts_partner_store") ?? 0, descuento_rappi = v("discounts_rappi") ?? 0;
  return { bruto, descuento_restaurante, subtotal_restaurante: v("subtotal_rest") ?? centavos(bruto - descuento_restaurante), descuento_rappi, facturar: centavos(t.total.value) };
}

/** IDs y fechas de la tabla del historial (vista de escritorio): "#2481664517  18/10/2026 ...". */
export function leerListado(texto) {
  return [...texto.matchAll(/#(\d{8,20})\s+(\d{2})\/(\d{2})\/(\d{4})/g)].map((m) => ({ id: m[1], fecha: `${m[4]}-${m[3]}-${m[2]}` }));
}
