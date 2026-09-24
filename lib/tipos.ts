export type Rol = "cajero" | "encargado" | "gerente" | "admin";
export type TipoCaja = "venta" | "cambios" | "boveda" | "caja_chica" | "banco";
export type TipoTurno = "matutino" | "vespertino";
export type MomentoArqueo = "inicio" | "traspaso" | "cierre";
export type TipoMovimiento =
  | "apertura"
  | "retiro_boveda"
  | "cambio_morralla"
  | "deposito_banco"
  | "reposicion_caja_chica";
export type EstadoMovimiento = "pendiente" | "confirmado" | "rechazado";
export type Comprobante = "cfdi" | "nota" | "sin_comprobante";

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  sucursal_id: string | null;
}

export interface Sucursal {
  id: string;
  nombre: string;
  fondo_caja_venta: number;
  fondo_cambios: number;
  fondo_caja_chica: number;
  limite_retiro: number;
}

export interface Caja {
  id: string;
  tipo: TipoCaja;
  nombre: string;
}

export interface Turno {
  id: string;
  fecha: string;
  tipo: TipoTurno;
  abierto_en: string;
  cerrado_en: string | null;
  encargado_id: string;
}

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  caja_origen_id: string;
  caja_destino_id: string;
  monto: number;
  folio: string | null;
  nota: string | null;
  estado: EstadoMovimiento;
  registrado_por: string;
  confirmado_por: string | null;
  creado_en: string;
}

export interface Arqueo {
  id: string;
  turno_id: string;
  momento: MomentoArqueo;
  total_contado: number;
  esperado: number;
  diferencia: number;
  entrega_id: string;
  recibe_id: string | null;
  creado_en: string;
}

/** Cada tipo de movimiento solo puede ir por esta ruta (la base de datos lo vuelve a validar). */
export const RUTAS: Record<TipoMovimiento, { origen: TipoCaja[]; destino: TipoCaja[] }> = {
  apertura: { origen: ["boveda"], destino: ["venta"] },
  retiro_boveda: { origen: ["venta"], destino: ["boveda"] },
  cambio_morralla: { origen: ["venta", "cambios"], destino: ["venta", "cambios"] },
  deposito_banco: { origen: ["boveda"], destino: ["banco"] },
  reposicion_caja_chica: { origen: ["banco"], destino: ["caja_chica"] },
};

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  apertura: "Fondo inicial a caja de venta",
  retiro_boveda: "Retiro a bóveda",
  cambio_morralla: "Cambio de morralla",
  deposito_banco: "Depósito al banco",
  reposicion_caja_chica: "Reposición de caja chica",
};

export const NOMBRE_MOMENTO: Record<MomentoArqueo, string> = {
  inicio: "Inicio de turno",
  traspaso: "Traspaso de turno",
  cierre: "Cierre de turno",
};
