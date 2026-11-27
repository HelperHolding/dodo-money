/**
 * Un UUID de CFDI (folio fiscal) se sube una sola vez entre facturas (XML o captura manual) y gastos de caja chica.
 * La pantalla avisa antes de guardar con `buscar_uuid_cfdi`; el trigger de la base vuelve a validar (HD-19).
 */
// @ts-expect-error Node strip-types requiere extensión explícita.
import { ligaSegura } from "../ligas.ts";

export type CoincidenciaUuid = {
  origen: "factura" | "gasto";
  registro_id: string;
  fecha: string | null;
  sucursal: string | null;
  usuario: string | null;
  creado_en: string;
  liga: string | null;
};
export type AvisoUuid = { texto: string; liga: string | null };

/** Igual que `public.normalizar_uuid_cfdi`: sin espacios y en mayúsculas; vacío es null. */
export const normalizarUuidCfdi = (x: string | null | undefined): string | null => (x ?? "").replace(/\s/g, "").toUpperCase() || null;

const diaMX = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });
/** Fecha en Ciudad de México de un timestamptz, como dd/mm/aaaa. */
export const fechaDMA = (iso: string) => diaMX.format(new Date(iso)).split("-").reverse().join("/");

export const mensajeUuidRepetido = (c: CoincidenciaUuid) =>
  `Este UUID ya se subió el ${fechaDMA(c.creado_en)} por ${c.usuario ?? "usuario sin registro"} en ${c.sucursal ?? "Oficina"} (${c.origen === "factura" ? "factura" : "gasto de caja chica"}).`;


/** Error de Supabase (por ejemplo, el trigger que saltó por una carrera): su mensaje y, si trae, la liga. */
export const avisoDeError = (e: { message: string; hint?: string | null }): AvisoUuid => ({ texto: e.message, liga: ligaSegura(e.hint) });

type ConRpc = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** Aviso del primer registro que ya tiene el UUID (sin contar `excluir`), o null. Si la consulta falla, decide la base. */
export async function buscarUuidRepetido(supabase: ConRpc, uuid: string | null | undefined, excluir: string | null = null): Promise<AvisoUuid | null> {
  const p_uuid = normalizarUuidCfdi(uuid);
  if (!p_uuid) return null;
  const { data, error } = await supabase.rpc("buscar_uuid_cfdi", { p_uuid, p_excluir: excluir || null });
  const c = !error && Array.isArray(data) ? (data[0] as CoincidenciaUuid | undefined) : undefined;
  return c ? { texto: mensajeUuidRepetido(c), liga: ligaSegura(c.liga) } : null;
}
