import type { EstadoPedido, Origen, Pago, TipoPedido } from "./datosBrutos";
import type { Desglose, Montos, TipoDesglose } from "./extraer";

/** Cálculos sobre pedidos (de Datos brutos o, más adelante, de la API de Dodo IS). Solo números, sin datos. */

/** Lo que los reportes necesitan de un pedido: coincide con las columnas de la tabla `pedidos`. */
export type Pedido = {
  dodo_id: string;
  fecha: string;
  hora: string;
  pago: Pago;
  tipo: TipoPedido;
  origen: Origen;
  para_llevar: boolean;
  estado: EstadoPedido;
  total: number;
  total_sin_descuento: number;
  agregador?: string | null;
  inicio_coccion: string | null;
  listo: string | null;
  entregado: string | null;
};

export type LineaPedido = { pedido_id: string; nombre: string; precio: number; combo: string | null };

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Cuenta como venta: entregado y no es comida del personal (igual que el reporte de Ventas de Dodo IS). */
export const cuentaComoVenta = (p: Pick<Pedido, "estado" | "tipo">) => p.estado === "entregado" && p.tipo !== "personal";

/** IVA como lo calcula Dodo IS: por producto, redondeando cada uno. */
export const ivaDe = (precios: readonly number[]) => redondear(precios.reduce((s, p) => s + redondear((p * 16) / 116), 0));

/** Tipos de servicio y de origen del desglose del reporte de Ventas a los que pertenece un pedido. */
export function tiposDesglose(p: Pick<Pedido, "tipo" | "origen" | "agregador">): TipoDesglose[] {
  const servicio: TipoDesglose = p.tipo === "entrega" ? "entrega" : p.origen === "app" || p.origen === "sitio" ? "llevadera" : "restaurante";
  const origen: TipoDesglose[] = [];
  if (p.origen === "sitio") origen.push("sitio");
  if (p.origen === "app") origen.push("app");
  if (p.agregador) origen.push("agregador");
  return [servicio, ...origen];
}

export type DiaImportado = {
  sucursal: string;
  fecha: string;
  resumen: Montos;
  desglose: Desglose[];
  /** Productos vendidos (piezas) y su suma, de los pedidos que cuentan como venta: para la bitácora. */
  productos: { piezas: number; suma: number };
  personal: { pedidos: number; monto: number };
  cancelados: { pedidos: number; monto: number };
};

const vacio = (): Montos => ({ pedidos: 0, total: 0, efectivo: 0, tarjeta: 0, en_linea: 0, iva: 0 });
function sumar(m: Montos, p: Pedido, iva: number) {
  m.pedidos += 1;
  m.total = redondear(m.total + p.total);
  if (p.pago === "efectivo") m.efectivo = redondear(m.efectivo + p.total);
  if (p.pago === "tarjeta") m.tarjeta = redondear(m.tarjeta + p.total);
  if (p.pago === "en_linea") m.en_linea = redondear(m.en_linea + p.total);
  m.iva = redondear(m.iva + iva);
}

/** Resumen por sucursal y día: venta (con IVA por producto), desglose, comidas del personal y cancelados. */
export function resumirDias(pedidos: readonly (Pedido & { sucursal: string })[], lineas: readonly LineaPedido[]): DiaImportado[] {
  const preciosDe = new Map<string, number[]>();
  for (const l of lineas) preciosDe.set(l.pedido_id, [...(preciosDe.get(l.pedido_id) ?? []), l.precio]);
  const dias = new Map<string, DiaImportado & { tipos: Map<TipoDesglose, Montos> }>();
  for (const p of pedidos) {
    const clave = `${p.sucursal}|${p.fecha}`;
    const d = dias.get(clave) ?? {
      sucursal: p.sucursal, fecha: p.fecha, resumen: vacio(), desglose: [], tipos: new Map(), productos: { piezas: 0, suma: 0 },
      personal: { pedidos: 0, monto: 0 }, cancelados: { pedidos: 0, monto: 0 },
    };
    dias.set(clave, d);
    if (p.tipo === "personal" && p.estado === "entregado") {
      d.personal.pedidos++;
      d.personal.monto = redondear(d.personal.monto + p.total_sin_descuento);
      continue;
    }
    if (p.estado === "cancelado") {
      d.cancelados.pedidos++;
      d.cancelados.monto = redondear(d.cancelados.monto + p.total);
      continue;
    }
    const precios = preciosDe.get(p.dodo_id) ?? [];
    const iva = ivaDe(precios);
    sumar(d.resumen, p, iva);
    d.productos.piezas += precios.length;
    d.productos.suma = redondear(d.productos.suma + precios.reduce((s, x) => s + x, 0));
    for (const t of tiposDesglose(p)) {
      if (!d.tipos.has(t)) d.tipos.set(t, vacio());
      sumar(d.tipos.get(t)!, p, iva);
    }
  }
  return [...dias.values()]
    .map(({ tipos, ...d }) => ({ ...d, desglose: [...tipos].map(([tipo, m]) => ({ tipo, ...m })) }))
    .sort((a, b) => a.sucursal.localeCompare(b.sucursal) || a.fecha.localeCompare(b.fecha));
}

// ─── Reportes ────────────────────────────────────────────────────────────────

const minutos = (desde: string, hasta: string) => (Date.parse(hasta) - Date.parse(desde)) / 60_000;
const momentoPedido = (p: Pick<Pedido, "fecha" | "hora">) => `${p.fecha}T${p.hora}:00-06:00`;
/** Nombre corto del día de la semana: DIAS_SEMANA[diaSemana(fecha) - 1]. */
export const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

/** Lunes = 1 … domingo = 7. */
export const diaSemana = (fecha: string) => ((new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

function mediana(valores: readonly number[]): number | null {
  if (!valores.length) return null;
  const a = [...valores].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export type CeldaHora = { dia: number; hora: number; total: number; pedidos: number };

/** Venta por día de la semana y hora (solo pedidos que cuentan como venta), y la celda con más venta. */
export function ventaPorHora(pedidos: readonly Pedido[]) {
  const celdas = new Map<string, CeldaHora>();
  for (const p of pedidos.filter(cuentaComoVenta)) {
    const dia = diaSemana(p.fecha), hora = Number(p.hora.slice(0, 2));
    const c = celdas.get(`${dia}|${hora}`) ?? { dia, hora, total: 0, pedidos: 0 };
    c.total = redondear(c.total + p.total);
    c.pedidos++;
    celdas.set(`${dia}|${hora}`, c);
  }
  const lista = [...celdas.values()];
  const pico = lista.reduce<CeldaHora | null>((a, c) => (!a || c.total > a.total ? c : a), null);
  const horas = lista.map((c) => c.hora);
  return { celdas: lista, pico, horaMin: horas.length ? Math.min(...horas) : null, horaMax: horas.length ? Math.max(...horas) : null };
}

export type Canal = Origen | "entrega";
export type ResumenCanal = { canal: Canal; pedidos: number; total: number; ticket: number | null; efectivo: number; tarjeta: number };

/** Venta por canal (entrega o el origen del pedido en tienda) y cuánto de lo vendido en tienda fue para llevar. */
export function canales(pedidos: readonly Pedido[]) {
  const mapa = new Map<Canal, ResumenCanal>();
  let enTienda = 0, paraLlevar = 0;
  for (const p of pedidos.filter(cuentaComoVenta)) {
    const canal: Canal = p.tipo === "entrega" ? "entrega" : p.origen;
    const c = mapa.get(canal) ?? { canal, pedidos: 0, total: 0, ticket: null, efectivo: 0, tarjeta: 0 };
    c.pedidos++;
    c.total = redondear(c.total + p.total);
    if (p.pago === "efectivo") c.efectivo = redondear(c.efectivo + p.total);
    if (p.pago === "tarjeta") c.tarjeta = redondear(c.tarjeta + p.total);
    mapa.set(canal, c);
    if (p.tipo === "en_tienda") { enTienda++; if (p.para_llevar) paraLlevar++; }
  }
  const lista = [...mapa.values()].map((c) => ({ ...c, ticket: c.pedidos ? c.total / c.pedidos : null })).sort((a, b) => b.total - a.total);
  return { canales: lista, paraLlevar: enTienda ? paraLlevar / enTienda : null };
}

/** Umbral de cancelados (fracción de los pedidos) a partir del cual la sección se marca en rojo. */
export const UMBRAL_CANCELADOS = 0.03;

/** Comidas del personal (a precio de lista) y pedidos cancelados, con la lista de cancelados para revisar. */
export function personalYCancelados(pedidos: readonly Pedido[], lineas: readonly LineaPedido[]) {
  const venta = redondear(pedidos.filter(cuentaComoVenta).reduce((s, p) => s + p.total, 0));
  const personal = pedidos.filter((p) => p.tipo === "personal" && p.estado === "entregado");
  const cancelados = pedidos.filter((p) => p.estado === "cancelado");
  const productosDe = (id: string) => lineas.filter((l) => l.pedido_id === id).map((l) => l.nombre);
  const montoPersonal = redondear(personal.reduce((s, p) => s + p.total_sin_descuento, 0));
  return {
    personal: { pedidos: personal.length, monto: montoPersonal, pctVenta: venta ? montoPersonal / venta : null },
    cancelados: {
      pedidos: cancelados.length,
      monto: redondear(cancelados.reduce((s, p) => s + p.total, 0)),
      pct: pedidos.length ? cancelados.length / pedidos.length : null,
      lista: cancelados
        .map((p) => ({ dodo_id: p.dodo_id, fecha: p.fecha, hora: p.hora, total: p.total, productos: productosDe(p.dodo_id) }))
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)),
    },
    alerta: pedidos.length > 0 && cancelados.length / pedidos.length > UMBRAL_CANCELADOS,
  };
}

/** Minutos a partir de los cuales un pedido se cuenta como lento en cocina. */
export const MINUTOS_LENTO = 15;

/** Tiempos de cocina (inicio → listo) y de entrega (pedido → entregado) de los pedidos que cuentan como venta. */
export function tiempos(pedidos: readonly Pedido[]) {
  const venta = pedidos.filter(cuentaComoVenta);
  const conCocina = venta.filter((p) => p.inicio_coccion && p.listo).map((p) => ({ p, min: minutos(p.inicio_coccion!, p.listo!) }));
  const entrega = venta.filter((p) => p.entregado).map((p) => minutos(momentoPedido(p), p.entregado!));
  const porHora = new Map<number, number[]>();
  for (const { p, min } of conCocina) {
    const h = Number(p.hora.slice(0, 2));
    porHora.set(h, [...(porHora.get(h) ?? []), min]);
  }
  return {
    medianaCocina: mediana(conCocina.map((x) => x.min)),
    medianaEntrega: mediana(entrega),
    lentos: conCocina.filter((x) => x.min > MINUTOS_LENTO).length,
    pctLentos: conCocina.length ? conCocina.filter((x) => x.min > MINUTOS_LENTO).length / conCocina.length : null,
    sinTiempo: venta.length - conCocina.length,
    porHora: [...porHora].map(([hora, m]) => ({ hora, mediana: mediana(m)!, pedidos: m.length })).sort((a, b) => a.hora - b.hora),
    masLentos: [...conCocina].sort((a, b) => b.min - a.min).slice(0, 5)
      .map(({ p, min }) => ({ dodo_id: p.dodo_id, fecha: p.fecha, hora: p.hora, minutos: Math.round(min), total: p.total })),
  };
}

/** Combos vendidos: un par (pedido, combo) distinto es un combo vendido; la venta es la de sus productos. */
export function combos(pedidos: readonly Pedido[], lineas: readonly LineaPedido[]) {
  const venta = new Set(pedidos.filter(cuentaComoVenta).map((p) => p.dodo_id));
  const mapa = new Map<string, { combo: string; pedidos: Set<string>; productos: number; total: number }>();
  for (const l of lineas) {
    if (!l.combo || !venta.has(l.pedido_id)) continue;
    const c = mapa.get(l.combo) ?? { combo: l.combo, pedidos: new Set<string>(), productos: 0, total: 0 };
    c.pedidos.add(l.pedido_id);
    c.productos++;
    c.total = redondear(c.total + l.precio);
    mapa.set(l.combo, c);
  }
  return [...mapa.values()]
    .map((c) => ({ combo: c.combo, vendidos: c.pedidos.size, productos: c.productos, total: c.total }))
    .sort((a, b) => b.vendidos - a.vendidos || b.total - a.total);
}
