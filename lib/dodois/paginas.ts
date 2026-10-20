/**
 * Lee una lista de Dodo IS página por página (`skip`). No descarta líneas iguales (dos cajas idénticas en una entrega
 * son dos líneas); si la API ignora `skip` y devuelve otra vez la misma página, es un error y no se suma doble.
 */
export async function leerPaginas<T>(pedir: (skip: number) => Promise<{ items: T[]; fin: boolean }>, maxPaginas = 20): Promise<T[]> {
  const todas: T[] = [];
  let anterior: string | null = null;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const { items, fin } = await pedir(todas.length);
    if (!items.length) return todas;
    const firma = JSON.stringify(items);
    if (firma === anterior) throw new Error("Dodo IS repite páginas: no se puede leer la lista completa.");
    anterior = firma;
    todas.push(...items);
    if (fin) return todas;
  }
  throw new Error("La lista de Dodo IS trae demasiadas páginas.");
}
