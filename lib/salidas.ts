import type { EstadoMovimiento } from "./tipos";

/** Recepción en corporativo de una salida que un admin ya recogió. */
export type Recepcion = "aceptada" | "rechazada";

/** Recorrido del efectivo que sale a corporativo: la sucursal registra, un admin recoge y corporativo recibe. */
export type EstadoSalida = "por_recoger" | "en_camino" | "en_corporativo" | "no_cuadro" | "rechazada";

export const NOMBRE_ESTADO_SALIDA: Record<EstadoSalida, string> = {
  por_recoger: "Por recoger",
  en_camino: "Salida de sucursal",
  en_corporativo: "En corporativo",
  no_cuadro: "No cuadró",
  rechazada: "Rechazada",
};

/** Clase de la etiqueta .estado-*: rojo lo que espera a alguien, verde lo que ya llegó, tachado lo rechazado. */
export const CLASE_ESTADO_SALIDA: Record<EstadoSalida, "pendiente" | "confirmado" | "rechazado"> = {
  por_recoger: "pendiente",
  en_camino: "pendiente",
  en_corporativo: "confirmado",
  no_cuadro: "pendiente",
  rechazada: "rechazado",
};

type ConEstado = { estado: EstadoMovimiento; recepcion: Recepcion | null };

export function estadoSalida(m: ConEstado): EstadoSalida {
  if (m.estado === "pendiente") return "por_recoger";
  if (m.estado === "rechazado") return "rechazada";
  if (m.recepcion === "aceptada") return "en_corporativo";
  if (m.recepcion === "rechazada") return "no_cuadro";
  return "en_camino";
}

/** Para la tarjeta de corporativo: cuántas salidas van en camino y cuánto suman, más las que esperan al admin o no cuadraron. */
export function resumenEnCamino(salidas: readonly (ConEstado & { monto: number | string })[]) {
  const en = (estado: EstadoSalida) => salidas.filter((s) => estadoSalida(s) === estado);
  const enCamino = en("en_camino");
  return {
    cuantas: enCamino.length,
    total: Math.round(enCamino.reduce((suma, s) => suma + Number(s.monto), 0) * 100) / 100,
    porRecoger: en("por_recoger").length,
    noCuadro: en("no_cuadro").length,
  };
}
