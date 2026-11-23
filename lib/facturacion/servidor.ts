// lib/facturacion/servidor.ts
/** Unión del portal de facturación con la base y con Facturapi. Solo servidor: no se prueba con node --test. */
import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteFacturapi } from "./facturapi";
import type { Base } from "./timbrar";

export function facturapi() {
  const llave = process.env.FACTURAPI_KEY?.trim();
  if (!llave) throw new Error("Configura FACTURAPI_KEY en el servidor.");
  return crearClienteFacturapi(llave);
}

/** Implementación real de Base: las excepciones de SQL (YA_FACTURADO, EN_PROCESO:…, NO_FACTURABLE:…) se regresan como { error }. */
export function baseFacturacion(): Base {
  const db = crearClienteAdmin();
  return {
    async reservar(pedido, datos) {
      const { data, error } = await db.rpc("facturacion_reservar", { p_pedido: pedido, p_datos: datos });
      if (error) {
        if (/^(YA_FACTURADO|EN_PROCESO:|NO_FACTURABLE:)/.test(error.message)) return { error: error.message };
        throw new Error(error.message);
      }
      return { id: data as string };
    },
    async confirmar(id, f) {
      const { error } = await db.rpc("facturacion_confirmar", { p_id: id, p_facturapi_id: f.id, p_uuid: f.uuid, p_serie: f.series, p_folio: f.folio_number, p_subtotal: f.subtotal, p_iva: Math.round((f.total - f.subtotal) * 100) / 100 });
      if (!error) return;
      // Dos recuperaciones simultáneas pueden encontrar la misma factura timbrada: la segunda confirma lo ya confirmado.
      if (error.message.includes("no está en proceso")) {
        const { data } = await db.from("facturas_clientes").select("estado, facturapi_id").eq("id", id).single();
        if (data?.estado === "timbrada" && data.facturapi_id === f.id) return;
      }
      throw new Error(error.message);
    },
    async liberar(id, mensaje) {
      const { error } = await db.rpc("facturacion_liberar", { p_id: id, p_error: mensaje });
      if (error) throw new Error(error.message);
    },
    async token(id) {
      const { data, error } = await db.from("facturas_clientes").select("token_descarga").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data.token_descarga as string;
    },
  };
}

export async function sucursalFacturacion(): Promise<{ id: string; nombre: string }> {
  const { data, error } = await crearClienteAdmin().from("facturacion_sucursales").select("sucursal_id, sucursales(nombre)").limit(1).single();
  if (error) throw new Error(error.message);
  return { id: data.sucursal_id as string, nombre: (data.sucursales as unknown as { nombre: string }).nombre };
}
