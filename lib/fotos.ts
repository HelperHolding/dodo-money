/** Fotos de tickets y recibos de caja chica (bucket privado "comprobantes" en Supabase). */

export const BUCKET_FOTOS = "comprobantes";
/** Igual que file_size_limit del bucket. bodySizeLimit en next.config.ts deja 1 MB extra para el resto del formulario. */
export const MAX_FOTO_BYTES = 4 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Mensaje de error para el usuario, o null si la foto sirve (o si no hay foto: es opcional). */
export function validarFoto(archivo: { type: string; size: number } | null): string | null {
  if (!archivo) return null;
  if (!EXTENSION[archivo.type]) return "Adjunta una foto (JPG, PNG o HEIC).";
  if (archivo.size > MAX_FOTO_BYTES) return "La foto es muy pesada. Tómala de nuevo o elige otra de menos de 4 MB.";
  return null;
}

/** La primera carpeta es la sucursal: las políticas del bucket solo dejan subir y ver la propia. */
export const rutaFoto = (sucursalId: string, id: string, tipo: string) => `${sucursalId}/${id}.${EXTENSION[tipo] ?? "jpg"}`;
