import { timingSafeEqual } from "node:crypto";
/** Compara la llave de n8n sin filtrar su largo por tiempo; ignora espacios pegados al copiar en Vercel. */
export function llaveValida(recibida: string | null, esperada: string | undefined): boolean {
  const a = Buffer.from((recibida ?? "").trim()), b = Buffer.from((esperada ?? "").trim());
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
/** El servidor rechazó la dirección (5xx): el contacto se marca con rebote. */
export const esRebote = (detalle: string | null) => /\b5[0-9]{2}\b/.test(detalle ?? "");
