// @ts-expect-error Node strip-types requiere extensión explícita.
import { marcaItem, puntosItem } from "../aperturas.ts";
import type { ItemApertura } from "../aperturas";

export type ColorMarca = "gris" | "amarillo" | "azul" | "morado" | "verde";
type ItemPlano = Pick<ItemApertura, "tipo" | "estado" | "inicio" | "fin">;

export const ETIQUETA_COLOR: Record<ColorMarca, string> = {
  gris: "Sin iniciar", amarillo: "Cotizado", azul: "Comprado / en curso", morado: "Entregado", verde: "Instalado / listo",
};

/** Color por puntos (0 a 1). Umbrales y no igualdad: 1/3 y 2/3 son flotantes. Morado solo para equipo recibido (.75). */
function colorPorPuntos(p: number): ColorMarca {
  if (p >= 1) return "verde";
  if (p >= 0.7) return "morado";
  if (p >= 0.45) return "azul";
  if (p > 0.2) return "amarillo";
  return "gris";
}

export function colorMarca(i: ItemPlano, hoy: string): { color: ColorMarca; alerta: boolean; porValidar: boolean; noAplica: boolean } {
  const noAplica = i.estado === "no_aplica";
  const fecha = i.fin ?? i.inicio;
  const vencido = !!fecha && fecha < hoy && marcaItem(i) !== "listo";
  return {
    color: colorPorPuntos(puntosItem(i)),
    alerta: !noAplica && (i.estado === "bloqueado" || vencido),
    porValidar: i.estado === "por_validar",
    noAplica,
  };
}

export function necesitaAtencion(i: ItemPlano, hoy: string): boolean {
  const m = colorMarca(i, hoy);
  return !m.noAplica && (m.color === "gris" || m.alerta || m.porValidar);
}

export function conteoColores(items: ItemPlano[], hoy: string): Record<ColorMarca, number> {
  const r: Record<ColorMarca, number> = { gris: 0, amarillo: 0, azul: 0, morado: 0, verde: 0 };
  for (const i of items) {
    const m = colorMarca(i, hoy);
    if (!m.noAplica) r[m.color]++;
  }
  return r;
}

const fraccion = (n: number, total: number) => (total > 0 ? Math.round(Math.min(1, Math.max(0, n / total)) * 10000) / 10000 : 0);

/** Posición del clic (relativa a la imagen ya escalada) a fracción 0–1 del plano. */
export function aCoordenada(px: number, py: number, anchoMostrado: number, altoMostrado: number): { x: number; y: number } {
  return { x: fraccion(px, anchoMostrado), y: fraccion(py, altoMostrado) };
}
