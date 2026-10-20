import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorDodo, tokenDeAcceso, ventasDelDia } from "@/lib/dodois/cliente";
import { fechaASincronizar, traducirVentas, ventanaDelDia, type OrigenSincronizacion } from "@/lib/dodois/ventas";
import { tamanoPorNombre } from "@/lib/ventas/calculos";
import { ivaDe, resumirDias } from "@/lib/ventas/pedidos";

export type ResultadoDia = { sucursal: string; fecha: string; estado: "ok" | "omitido" | "error"; pedidos: number; total: number; mensaje: string };
const centavos = (n: number) => Math.round(n * 100) / 100;

async function registrar(admin: SupabaseClient, origen: OrigenSincronizacion, sucursalId: string | null, r: ResultadoDia, desconocidos: string[], inicio: string) {
  await admin.from("dodois_sincronizaciones").insert({
    inicio, fin: new Date().toISOString(), origen, sucursal_id: sucursalId, fecha: r.fecha, pedidos: r.pedidos, total: r.total,
    estado: r.estado, mensaje: r.mensaje || null, desconocidos,
  });
}

/** Trae de Dodo IS el día completo de cada sucursal ligada y lo guarda (o solo lo calcula con `simular`). */
export async function sincronizarVentas(admin: SupabaseClient, origen: OrigenSincronizacion, opciones: { fecha?: string; simular?: boolean } = {}): Promise<ResultadoDia[]> {
  const inicio = new Date().toISOString();
  const fecha = opciones.fecha ?? fechaASincronizar(origen, inicio);
  const resultados: ResultadoDia[] = [];
  let token: string;
  try {
    token = await tokenDeAcceso(admin);
  } catch (e) {
    const r: ResultadoDia = { sucursal: "—", fecha, estado: "error", pedidos: 0, total: 0, mensaje: (e as Error).message };
    if (!opciones.simular) await registrar(admin, origen, null, r, [], inicio);
    return [r];
  }
  const { data: sucursales } = await admin.from("sucursales").select("id, nombre, m2_comedor, dodois_unit_id").not("dodois_unit_id", "is", null).order("nombre")
    .returns<{ id: string; nombre: string; m2_comedor: number | null; dodois_unit_id: string }[]>();
  if (!(sucursales ?? []).length) return [{ sucursal: "—", fecha, estado: "omitido", pedidos: 0, total: 0, mensaje: "No hay sucursales ligadas a Dodo IS." }];

  for (const s of sucursales ?? []) {
    let desconocidos: string[] = [];
    let r: ResultadoDia;
    try {
      const ventas = await ventasDelDia(token, s.dodois_unit_id, ventanaDelDia(fecha));
      const t = traducirVentas(ventas, { sucursalDeUnidad: new Map([[s.dodois_unit_id, s.id]]), tamanoDe: tamanoPorNombre, ivaDe });
      desconocidos = t.desconocidos;
      const pedidos = t.pedidos.filter((p) => p.fecha === fecha);
      const ids = new Set(pedidos.map((p) => p.dodo_id));
      const productos = t.productos.filter((x) => ids.has(x.pedido_id));
      const dia = resumirDias(
        pedidos.map((p) => ({ ...p, sucursal: s.id, inicio_coccion: null, listo: null, entregado: null })),
        productos.map((x) => ({ pedido_id: x.pedido_id, nombre: x.nombre, precio: x.precio, combo: x.combo })))[0];
      const resumen = dia && {
        ...dia.resumen,
        venta_m2: s.m2_comedor ? centavos(dia.resumen.total / Number(s.m2_comedor)) : null,
        suma_productos: dia.productos.suma, productos: dia.productos.piezas,
      };
      if (opciones.simular) {
        r = { sucursal: s.nombre, fecha, estado: "ok", pedidos: resumen?.pedidos ?? 0, total: resumen?.total ?? 0, mensaje: "Simulación: no se guardó." };
      } else {
        const { data, error } = await admin.rpc("sincronizar_ventas_dodo", {
          p_sucursal: s.id, p_fecha: fecha, p_resumen: resumen ?? { pedidos: 0, total: 0, efectivo: 0, tarjeta: 0, en_linea: 0, iva: 0, venta_m2: null, suma_productos: 0, productos: 0 },
          p_desglose: dia?.desglose ?? [], p_pedidos: pedidos, p_productos: productos,
        });
        if (error) throw new Error(error.message);
        const estado = data === "ok" ? "ok" : "omitido";
        const mensaje = data === "excel" ? "Día importado de Excel: se respeta." : data === "vacio" ? "Sin ventas todavía." : "";
        r = { sucursal: s.nombre, fecha, estado, pedidos: resumen?.pedidos ?? 0, total: resumen?.total ?? 0, mensaje };
      }
    } catch (e) {
      r = { sucursal: s.nombre, fecha, estado: "error", pedidos: 0, total: 0, mensaje: (e as Error).message };
      if (e instanceof ErrorDodo && e.reconectar) await admin.rpc("dodois_marcar_error", { p_mensaje: r.mensaje, p_reconectar: true });
    }
    resultados.push(r);
    if (!opciones.simular) await registrar(admin, origen, s.id, r, desconocidos, inicio);
  }
  if (!opciones.simular) await admin.from("dodois_sincronizaciones").delete().lt("inicio", new Date(Date.now() - 60 * 86_400_000).toISOString());
  return resultados;
}
