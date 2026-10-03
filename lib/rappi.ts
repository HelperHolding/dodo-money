/** Corte de Rappi: lo que dice el reporte de Rappi del día, mientras no esté la integración. */

export function leerCorteRappi(texto: string): { monto: number | null } | { error: string } {
  const limpio = texto.replace(/[$,\s]/g, "");
  if (!limpio) return { monto: null };
  const monto = Number(limpio);
  if (!Number.isFinite(monto)) return { error: "Escribe el total del corte de Rappi en pesos." };
  if (monto < 0) return { error: "El corte de Rappi no puede ser negativo." };
  return { monto: Math.round(monto * 100) / 100 };
}

/** Corte de Rappi menos lo que trae Dodo IS; null si no se capturó el corte. */
export const diferenciaRappi = (rappiDodo: number, corte: number | null) =>
  corte === null ? null : Math.round((corte - rappiDodo) * 100) / 100;

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};
const MAX_BYTES = 4 * 1024 * 1024;

/** null si el archivo sirve (o si no hay: es opcional). */
export function problemaArchivoCorte(archivo: { type: string; size: number } | null): string | null {
  if (!archivo) return null;
  if (!EXTENSION[archivo.type]) return "El corte de Rappi debe ser foto o PDF.";
  if (archivo.size > MAX_BYTES) return "El archivo del corte pesa más de 4 MB.";
  return null;
}

/** En el bucket de comprobantes, en la carpeta de la sucursal (las políticas solo dejan subir a la propia). */
export const rutaCorteRappi = (sucursalId: string, fecha: string, id: string, tipo: string) =>
  `${sucursalId}/rappi/${fecha}-${id}.${EXTENSION[tipo] ?? "pdf"}`;
