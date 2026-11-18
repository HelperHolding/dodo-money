/** Valor del selector para "Toda la base": distinto de vacío, así un campo ausente nunca se vuelve "todos". */
export const TODOS = "__todos__";
/** Valor enviado por el formulario -> etiqueta a guardar (null = toda la base); undefined si el campo falta o está vacío. */
export function etiquetaDeFormulario(valor: string): string | null | undefined {
  const v = valor.trim();
  if (!v) return undefined;
  return v === TODOS ? null : v;
}
/** Opciones del selector: las etiquetas de contactos activos más la de la campaña, aunque ya no tenga contactos. */
export function opcionesEtiqueta(etiquetas: string[], actual: string | null): string[] {
  return actual && !etiquetas.includes(actual) ? [...etiquetas, actual].sort() : etiquetas;
}
