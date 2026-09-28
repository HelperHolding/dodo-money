/** Supabase devuelve como máximo 1000 renglones por consulta: se piden páginas hasta que una venga incompleta. */
export const TAMANO_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function leerTodo<T>(pagina: (desde: number, hasta: number) => Pagina<T>): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
    todo.push(...(data ?? []));
    if ((data ?? []).length < TAMANO_PAGINA) return todo;
  }
}
