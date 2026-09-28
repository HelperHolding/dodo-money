import type { Momento } from "./tipos";

/** Columnas de las listas del turno, en orden de la jornada. */
export const COLUMNAS: readonly { momento: Momento; titulo: string }[] = [
  { momento: "apertura", titulo: "Apertura" },
  { momento: "cambio", titulo: "Cambio de turno" },
  { momento: "durante_manana", titulo: "Durante (mañana)" },
  { momento: "durante_tarde", titulo: "Durante (tarde)" },
  { momento: "cierre", titulo: "Cierre" },
  { momento: "semanal", titulo: "Tareas del día" },
];

export type EstadoLista = "pendiente" | "hecho" | "revisado" | "no-aplica";

export function estadoLista(aplica: boolean, registro?: { revisado_por: string | null }): EstadoLista {
  if (!aplica) return "no-aplica";
  if (!registro) return "pendiente";
  return registro.revisado_por ? "revisado" : "hecho";
}

export type FilaLista = {
  checklistId: string;
  clave: string;
  nombre: string;
  celdas: { momento: Momento; titulo: string; estado: EstadoLista }[];
};

/** Una fila por lista que tiene momentos de turno; las que solo tienen ronda de la hora quedan fuera. */
export function filasListas(
  checklists: readonly { id: string; clave: string; nombre: string; orden: number }[],
  puntos: readonly { checklist_id: string; momento: Momento; dia_semana: number | null }[],
  registros: readonly { checklist_id: string; momento: Momento; revisado_por: string | null }[],
  diaSemana: number,
): FilaLista[] {
  return [...checklists]
    .sort((a, b) => a.orden - b.orden)
    .filter((c) => puntos.some((p) => p.checklist_id === c.id && p.momento !== "hora"))
    .map((c) => ({
      checklistId: c.id,
      clave: c.clave,
      nombre: c.nombre,
      celdas: COLUMNAS.map(({ momento, titulo }) => {
        const aplica = puntos.some((p) => p.checklist_id === c.id && p.momento === momento
          && (momento !== "semanal" || p.dia_semana === diaSemana));
        const registro = registros.find((r) => r.checklist_id === c.id && r.momento === momento);
        return { momento, titulo, estado: estadoLista(aplica, registro) };
      }),
    }));
}

export function contarListas(filas: readonly FilaLista[]): { total: number; hechas: number } {
  const celdas = filas.flatMap((f) => f.celdas).filter((c) => c.estado !== "no-aplica");
  return { total: celdas.length, hechas: celdas.filter((c) => c.estado !== "pendiente").length };
}

/** Una zona de la ronda se puede guardar si tiene nombre, todos los puntos marcados y comentario en cada "no cumple". */
export function zonaCompleta(
  empleado: string,
  respuestas: readonly { cumple: boolean | null; comentario: string | null }[],
): boolean {
  return empleado.trim() !== ""
    && respuestas.length > 0
    && respuestas.every((r) => r.cumple !== null && (r.cumple || (r.comentario ?? "").trim() !== ""));
}
