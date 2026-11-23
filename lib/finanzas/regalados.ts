/**
 * Pedidos regalados de Dodo IS: cobrados en $0 con precio de lista (promoción al 100 %, p. ej. pizzas para un evento).
 * No son venta: salen de la venta bruta y de los descuentos, y el costo teórico de sus piezas va a Marketing.
 */
import type { VentaProducto } from "../ventas/calculos";

export type PedidoVenta = { dodo_id: string; sucursal_id: string; fecha: string; hora: string; total: number; total_sin_descuento: number; promocion: string | null };
export type PiezaPedido = { pedido_id: string; dodo_id: number; nombre: string; precio: number; precio_sin_descuento: number };
export type PedidoRegalado = Omit<PedidoVenta, "total" | "total_sin_descuento"> & { piezas: number; precioLista: number; renglones: VentaProducto[] };

const centavos = (n: number) => Math.round(n * 100) / 100;

export const esRegalado = (p: Pick<PedidoVenta, "total" | "total_sin_descuento">) => Number(p.total) === 0 && Number(p.total_sin_descuento) > 0;

/**
 * Quita de la venta por producto las piezas de los pedidos regalados y las devuelve aparte, por pedido y producto.
 * Un pedido cuyas piezas no caben en la venta del día (otra fuente de importación) no se separa y queda en `sinCuadrar`.
 */
export function separarRegalados(ventas: readonly VentaProducto[], pedidos: readonly PedidoVenta[], piezas: readonly PiezaPedido[]) {
  const clave = (sucursal: string, fecha: string, dodo: number) => `${sucursal}|${fecha}|${dodo}`;
  const restante = new Map(ventas.map((v) => [clave(v.sucursal_id, v.fecha, v.dodo_id), { ...v, cantidad: Number(v.cantidad), importe_sin_descuento: Number(v.importe_sin_descuento) }]));
  const regalados: PedidoRegalado[] = [], sinCuadrar: string[] = [];
  for (const p of pedidos.filter(esRegalado)) {
    const porProducto = new Map<number, VentaProducto>();
    for (const x of piezas.filter((x) => x.pedido_id === p.dodo_id)) {
      const r = porProducto.get(x.dodo_id) ?? { sucursal_id: p.sucursal_id, fecha: p.fecha, dodo_id: x.dodo_id, nombre: x.nombre, cantidad: 0, importe: 0, importe_sin_descuento: 0 };
      r.cantidad += 1; r.importe_sin_descuento = centavos(r.importe_sin_descuento + Number(x.precio_sin_descuento));
      porProducto.set(x.dodo_id, r);
    }
    const renglones = [...porProducto.values()];
    const cabe = renglones.length > 0 && renglones.every((r) => {
      const v = restante.get(clave(r.sucursal_id, r.fecha, r.dodo_id));
      return v && v.cantidad >= r.cantidad && v.importe_sin_descuento >= r.importe_sin_descuento - 0.01;
    });
    if (!cabe) { sinCuadrar.push(p.dodo_id); continue; }
    for (const r of renglones) {
      const v = restante.get(clave(r.sucursal_id, r.fecha, r.dodo_id))!;
      v.cantidad -= r.cantidad; v.importe_sin_descuento = centavos(v.importe_sin_descuento - r.importe_sin_descuento);
    }
    regalados.push({
      dodo_id: p.dodo_id, sucursal_id: p.sucursal_id, fecha: p.fecha, hora: p.hora, promocion: p.promocion,
      piezas: renglones.reduce((t, r) => t + r.cantidad, 0), precioLista: centavos(renglones.reduce((t, r) => t + r.importe_sin_descuento, 0)), renglones,
    });
  }
  return { ventas: [...restante.values()].filter((v) => v.cantidad > 0), regalados, sinCuadrar };
}
