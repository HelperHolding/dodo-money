/** Ligas internas que viajan en la URL (`?liga=`) o en la pista (hint) de un error de la base. */
const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LIGA = new RegExp(`^(/compras/facturas/${ID}|/caja-chica(#gasto-${ID})?)$`);

/** Solo se acepta una ruta interna conocida, para no abrir una redirección a otro sitio. */
export const ligaSegura = (x: string | null | undefined): string | null => (x && LIGA.test(x) ? x : null);
