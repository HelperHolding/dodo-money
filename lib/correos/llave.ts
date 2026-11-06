import { timingSafeEqual } from "node:crypto";
/** Compara la llave de n8n sin filtrar su largo por tiempo; ignora espacios pegados al copiar en Vercel. */
export function llaveValida(recibida: string | null, esperada: string | undefined): boolean {
  const a = Buffer.from((recibida ?? "").trim()), b = Buffer.from((esperada ?? "").trim());
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
/**
 * El servidor rechazó la dirección de forma permanente: el contacto se marca con rebote.
 * Con código extendido (x.y.z) solo cuentan 5.1.1, 5.1.2, 5.1.3 y 5.1.10 (buzón o dominio inexistente); cuota,
 * spam o autenticación del remitente (5.4.5, 5.7.1, 5.2.0…) son fallas de envío, no del contacto.
 * Sin código extendido, solo 550/551/553 al inicio o tras un separador. Conexión, credenciales (535) o buzón lleno (552) no.
 */
const CODIGO = /(?:^|[:;,]\s+|\s-\s)55[013](?=[\s-]|$)/;
// Sin dígitos pegados (ni "d." antes o ".d" después), para no leer 5.1.2 dentro de una IP como 10.5.1.2:587; un punto final de frase sí se permite.
const EXTENDIDO = /(?<!\d|\d\.)[45]\.\d{1,3}\.\d{1,3}(?!\d|\.\d)/g;
const DE_DIRECCION = new Set(["5.1.1", "5.1.2", "5.1.3", "5.1.10"]);
export function esRebote(detalle: string | null): boolean {
  const d = detalle ?? "", estados = d.match(EXTENDIDO);
  return estados ? estados.some((e) => DE_DIRECCION.has(e)) : CODIGO.test(d);
}
