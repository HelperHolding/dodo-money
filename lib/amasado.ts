/** Rangos de la hoja "Dough mixing, production" (°C, inclusivos). */
export const RANGOS_AMASADO = { masa: [24, 26], sala: [16, 26], harina: [16, 26], agua: [9, 20] } as const;

export type TempsAmasado = { masa: number; sala: number; harina: number; agua: number };

const NOMBRE: Record<keyof TempsAmasado, string> = { masa: "la masa", sala: "la sala", harina: "la harina", agua: "el agua" };
const ORDEN: (keyof TempsAmasado)[] = ["masa", "sala", "harina", "agua"];

export function fueraDeRango(t: TempsAmasado): (keyof TempsAmasado)[] {
  return ORDEN.filter((k) => t[k] < RANGOS_AMASADO[k][0] || t[k] > RANGOS_AMASADO[k][1]);
}

/** Por qué el comentario es obligatorio (la primera temperatura fuera de rango), o null. */
export function motivoAmasado(t: TempsAmasado): string | null {
  const k = fueraDeRango(t)[0];
  if (!k) return null;
  const [min, max] = RANGOS_AMASADO[k];
  return `${NOMBRE[k]} está a ${t[k]} °C, fuera de ${min} a ${max} °C`;
}
