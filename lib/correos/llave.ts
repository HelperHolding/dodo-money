import { timingSafeEqual } from "node:crypto";
/** Compara la llave de n8n sin filtrar su largo por tiempo; ignora espacios pegados al copiar en Vercel. */
export function llaveValida(recibida: string | null, esperada: string | undefined): boolean {
  const a = Buffer.from((recibida ?? "").trim()), b = Buffer.from((esperada ?? "").trim());
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
/** El servidor rechazó la dirección de forma permanente (550/551/553/554 o estado 5.1.1/2/3/10): el contacto se marca con rebote. Fallas de conexión, credenciales (535) o buzón lleno (552) no. */
const CODIGO = /(?:^|[:;,]\s+|\s-\s)55[0134](?=[\s-]|$)/;
const ESTADO = /\b5\.1\.(?:1|2|3|10)\b/;
export const esRebote = (detalle: string | null) => CODIGO.test(detalle ?? "") || ESTADO.test(detalle ?? "");
