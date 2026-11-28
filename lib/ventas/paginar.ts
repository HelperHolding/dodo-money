/** Supabase devuelve como máximo 1000 renglones por consulta: se piden páginas hasta que una venga incompleta. */
export const TAMANO_PAGINA = 1000;

export type ErrorLectura = { message: string; code?: string | null };
type Respuesta = { data: unknown; error: ErrorLectura | null };
type Pagina<T> = PromiseLike<{ data: T[] | null; error: ErrorLectura | null }>;

/** Esperas entre intentos (ms): hasta 3 intentos en total. */
export const ESPERAS_REINTENTO: readonly number[] = [400, 1200];

/**
 * Fallas pasajeras que vale la pena repetir: límite de tiempo de Postgres (57014), conflicto de serialización o bloqueo
 * mutuo, conexión caída o saturada, PostgREST sin conexión a la base, o la red. Permisos, columnas o datos inválidos no
 * se repiten: fallarían igual la segunda vez.
 */
export function esFallaPasajera(error: ErrorLectura): boolean {
  const code = error.code ?? "";
  if (["57014", "40001", "40P01", "53300", "57P01", "57P03", "PGRST000", "PGRST001", "PGRST002", "PGRST003"].includes(code)) return true;
  if (code.startsWith("08")) return true;
  return /statement timeout|fetch failed|network|ECONNRESET|ETIMEDOUT|socket hang up|upstream|timed out|gateway/i.test(error.message);
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Hace la consulta y, si falla de forma pasajera, la repite tras una espera creciente. Devuelve la última respuesta
 * (con su error si no se recuperó) para que quien llama decida cómo avisar. `consulta` debe armar una consulta nueva
 * cada vez: un builder de Supabase ya resuelto no se vuelve a enviar.
 */
export async function conReintento<R extends Respuesta>(
  consulta: () => PromiseLike<R>,
  esperas: readonly number[] = ESPERAS_REINTENTO,
  esperar: (ms: number) => Promise<void> = dormir,
): Promise<R> {
  for (let intento = 0; ; intento++) {
    let r: R;
    try {
      r = await consulta();
    } catch (e) {
      // La red puede lanzar en lugar de devolver { error }.
      r = { data: null, error: { message: e instanceof Error ? e.message : String(e) } } as R;
    }
    if (!r.error || !esFallaPasajera(r.error) || intento >= esperas.length) return r;
    console.warn(`Lectura repetida (${intento + 1}/${esperas.length}): ${r.error.code ?? ""} ${r.error.message}`);
    await esperar(esperas[intento]);
  }
}

export async function leerTodo<T>(
  pagina: (desde: number, hasta: number) => Pagina<T>,
  esperas: readonly number[] = ESPERAS_REINTENTO,
  esperar?: (ms: number) => Promise<void>,
): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await conReintento(() => pagina(desde, desde + TAMANO_PAGINA - 1), esperas, esperar);
    if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
    todo.push(...(data ?? []));
    if ((data ?? []).length < TAMANO_PAGINA) return todo;
  }
}
