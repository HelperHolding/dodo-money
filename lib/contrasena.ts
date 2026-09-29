/** Reglas para cambiar la contraseña desde la app. */

export const MIN_CARACTERES = 8;

/** Mensaje de error para el formulario, o null si la contraseña nueva se puede guardar. */
export function errorDeContrasena(actual: string, nueva: string, confirmar: string): string | null {
  if (!actual) return "Escribe tu contraseña actual.";
  if (!nueva) return "Escribe la contraseña nueva.";
  if (nueva.length < MIN_CARACTERES) return `La contraseña nueva debe tener al menos ${MIN_CARACTERES} caracteres.`;
  if (nueva !== confirmar) return "Las dos contraseñas nuevas no coinciden.";
  if (nueva === actual) return "La contraseña nueva debe ser distinta de la actual.";
  return null;
}
