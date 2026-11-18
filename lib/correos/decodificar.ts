/** Decodifica los bytes de un CSV: UTF-8 (con o sin BOM) y, si no lo es, Windows-1252 (Excel en español). */
export function decodificarCsv(bytes: ArrayBuffer | Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}
