"use server";

import { ventaDiariaDesde } from "@/app/ventas/datos";
import { obtenerPerfil } from "@/lib/contexto";
import { veVentasDeTodas } from "@/lib/roles";
import { DESDE_HISTORIAL } from "@/lib/ventas/inicio";

/**
 * Venta diaria (Dodo IS + subtotal de Rappi) de una sucursal o de toda la red, para el historial del inicio.
 * La pide el navegador al cambiar de alcance, sin recargar la página. Solo admin y corporativo (el mismo dashboard).
 */
export async function ventaHistorial(sucursal: string | null): Promise<Record<string, number>> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!veVentasDeTodas(perfil.rol)) throw new Error("Sin permiso para ver las ventas de todas las sucursales.");
  return ventaDiariaDesde(supabase, sucursal, DESDE_HISTORIAL);
}
