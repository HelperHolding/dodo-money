import type { Hoja } from "./xlsx";

/** Lectura del archivo "Datos brutos" de Dodo IS: hojas RawData (pedidos) y OrderPositions (productos). */

export type Pago = "efectivo" | "tarjeta" | "en_linea" | "otro";
export type TipoPedido = "en_tienda" | "entrega" | "personal";
export type Origen = "mostrador" | "kiosco" | "app" | "sitio" | "otro";
export type EstadoPedido = "entregado" | "cancelado";

export type PedidoBruto = {
  dodo_id: string;
  sucursal: string;
  fecha: string;
  hora: string;
  pago: Pago;
  tipo: TipoPedido;
  origen: Origen;
  origen_dodo: string;
  para_llevar: boolean;
  estado: EstadoPedido;
  total: number;
  total_sin_descuento: number;
  productos: number;
  promocion: string | null;
  cliente_id: string | null;
  cliente_pedidos: number | null;
  turno_dodo: string | null;
  agregador: string | null;
  /** Hora de Ciudad de México con desfase: "2026-09-28T21:04:00-06:00". */
  inicio_coccion: string | null;
  listo: string | null;
  entregado: string | null;
};

export type ProductoBruto = {
  pedido_id: string;
  renglon: number;
  dodo_uuid: string;
  /** Producto + tamaño, como en ProductsSales: "Pepperoni Mediano". */
  nombre: string;
  precio: number;
  precio_sin_descuento: number;
  costo_dodo: number | null;
  combo: string | null;
};

export type ArchivoBruto = { pedidos: PedidoBruto[]; productos: ProductoBruto[] };

export const NO_ES_DATOS_BRUTOS = "Este archivo no parece un Datos brutos de Dodo IS.";
export const SIN_PEDIDOS = "El archivo no trae pedidos.";
export const HOJAS_NO_COINCIDEN = "Hay productos de pedidos que no están en OrderPositions, o productos sin su pedido.";
export const MAX_DIAS_ARCHIVO = 92;
export const ARCHIVO_MUY_GRANDE = "El archivo es muy grande para guardarlo de una vez; expórtalo e impórtalo por semanas.";

/** Mensaje para el admin cuando falla el guardado: si Supabase cortó por tiempo, qué hacer; si no, el error tal cual. */
export const DIA_CONCILIADO = "Ese día ya está conciliado en Banca → Conciliación. Anula esa conciliación antes de reemplazar sus ventas.";
export const mensajeAlGuardar = (mensaje: string) => (
  /statement timeout/i.test(mensaje) ? ARCHIVO_MUY_GRANDE
    : /banca_conciliacion_documentos/i.test(mensaje) && /foreign key|23503/i.test(mensaje) ? DIA_CONCILIADO
    : mensaje
);

const COLUMNAS_PEDIDOS = [
  "OrderId", "Store", "Date", "Time", "Price", "PriceWithoutDiscount", "ProductsCount", "PaymentType", "Type",
  "State", "Source", "BonusAction", "ClientId", "OrderCount", "ShiftId", "Aggregator", "TakeAway",
  "StartCookingAt", "ReadyAt", "GivenOutAt",
] as const;
const COLUMNAS_PRODUCTOS = ["OrderId", "ProductUUId", "Product", "ProductSize", "productPrice", "ProductPriceWithoutDiscount", "unitCost", "Combo"] as const;

const limpiar = (t: string) => t.replace(/\s+/g, " ").trim();

/** Renglones de una hoja como objetos por nombre de columna (fila 1 = encabezados). */
function renglones(h: Hoja, requeridas: readonly string[]): Record<string, string>[] {
  const filas = new Map<number, Map<string, string>>();
  for (const [ref, valor] of h.celdas) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    const fila = Number(m[2]);
    if (!filas.has(fila)) filas.set(fila, new Map());
    filas.get(fila)!.set(m[1], String(valor));
  }
  const encabezado = filas.get(1);
  if (!encabezado) throw new Error(NO_ES_DATOS_BRUTOS);
  const columna = new Map([...encabezado].map(([col, nombre]) => [limpiar(nombre), col]));
  if (requeridas.some((r) => !columna.has(r))) throw new Error(NO_ES_DATOS_BRUTOS);
  return [...filas.keys()].filter((f) => f > 1).sort((a, b) => a - b).map((f) => {
    const fila = filas.get(f)!;
    return Object.fromEntries([...columna].map(([nombre, col]) => [nombre, (fila.get(col) ?? "").trim()]));
  });
}

const numero = (t: string) => {
  const n = Number(t.replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const texto = (t: string) => (t === "" ? null : t);

/** "28.09.2026" → "2026-09-28". */
function fechaDe(t: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t);
  if (!m) throw new Error(NO_ES_DATOS_BRUTOS);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "28.09.2026 21:04" → "2026-09-28T21:04:00-06:00" (México no tiene horario de verano desde 2022). */
function momentoDe(t: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4].padStart(2, "0")}:${m[5]}:00-06:00` : null;
}

const PAGOS: Record<string, Pago> = { Cash: "efectivo", BankCard: "tarjeta", InternetAcquiring: "en_linea" };
const TIPOS: Record<string, TipoPedido> = { Stationary: "en_tienda", Delivery: "entrega", PersonalFood: "personal" };
const ORIGENES: Record<string, Origen> = { Restaurant: "mostrador", Kiosk: "kiosco", Mobile: "app", Site: "sitio" };

const DIA = 86_400_000;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);

/** Lee y valida un Datos brutos ya convertido en hojas. Lanza Error con el mensaje para el admin. */
export function extraerDatosBrutos(hojas: readonly Hoja[]): ArchivoBruto {
  const hoja = (nombre: string) => hojas.find((h) => limpiar(h.nombre) === nombre);
  const raw = hoja("RawData"), posiciones = hoja("OrderPositions");
  if (!raw || !posiciones) throw new Error(NO_ES_DATOS_BRUTOS);

  const pedidos: PedidoBruto[] = renglones(raw, COLUMNAS_PEDIDOS).filter((r) => r.OrderId).map((r) => {
    const tipo = TIPOS[r.Type];
    if (!tipo) throw new Error(`${NO_ES_DATOS_BRUTOS} Tipo de pedido desconocido: ${r.Type}.`);
    return {
      dodo_id: r.OrderId,
      sucursal: limpiar(r.Store),
      fecha: fechaDe(r.Date),
      hora: r.Time.padStart(5, "0"),
      pago: PAGOS[r.PaymentType] ?? "otro",
      tipo,
      origen: ORIGENES[r.Source] ?? "otro",
      origen_dodo: r.Source,
      para_llevar: r.TakeAway === "1",
      estado: r.State === "Failure" ? "cancelado" : "entregado",
      total: numero(r.Price),
      total_sin_descuento: numero(r.PriceWithoutDiscount),
      productos: Math.round(numero(r.ProductsCount)),
      promocion: texto(r.BonusAction),
      cliente_id: texto(r.ClientId),
      cliente_pedidos: r.OrderCount ? Math.round(numero(r.OrderCount)) : null,
      turno_dodo: texto(r.ShiftId),
      agregador: texto(r.Aggregator),
      inicio_coccion: momentoDe(r.StartCookingAt),
      listo: momentoDe(r.ReadyAt),
      entregado: momentoDe(r.GivenOutAt),
    };
  });
  if (!pedidos.length) throw new Error(SIN_PEDIDOS);

  const renglonDe = new Map<string, number>();
  const productos: ProductoBruto[] = renglones(posiciones, COLUMNAS_PRODUCTOS).filter((r) => r.OrderId).map((r) => {
    const renglon = (renglonDe.get(r.OrderId) ?? 0) + 1;
    renglonDe.set(r.OrderId, renglon);
    return {
      pedido_id: r.OrderId,
      renglon,
      dodo_uuid: r.ProductUUId,
      nombre: limpiar(`${r.Product} ${r.ProductSize}`),
      precio: numero(r.productPrice),
      precio_sin_descuento: numero(r.ProductPriceWithoutDiscount),
      costo_dodo: r.unitCost === "" ? null : numero(r.unitCost),
      combo: texto(limpiar(r.Combo)),
    };
  });

  // Cada producto con su pedido, y cada pedido con tantos productos como dice ProductsCount.
  const ids = new Set(pedidos.map((p) => p.dodo_id));
  if (productos.some((x) => !ids.has(x.pedido_id))) throw new Error(HOJAS_NO_COINCIDEN);
  if (pedidos.some((p) => (renglonDe.get(p.dodo_id) ?? 0) !== p.productos)) throw new Error(HOJAS_NO_COINCIDEN);

  const fechas = pedidos.map((p) => p.fecha).sort();
  if (diasEntre(fechas[0], fechas[fechas.length - 1]) >= MAX_DIAS_ARCHIVO) {
    throw new Error(`El archivo abarca más de ${MAX_DIAS_ARCHIVO} días.`);
  }
  return { pedidos, productos };
}
