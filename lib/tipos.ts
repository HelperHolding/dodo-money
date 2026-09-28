export type Rol = "cajero" | "encargado" | "gerente" | "admin" | "corporativo";
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

// ─── Checklists ─────────────────────────────────────────────────────────────
export type MotivoMerma = "caducidad" | "empaque_danado" | "mal_estado" | "error_humano";
export type TempArea = 25 | 30 | 35;

export const NOMBRE_MOTIVO: Record<MotivoMerma, string> = {
  caducidad: "Caducidad",
  empaque_danado: "Empaque dañado",
  mal_estado: "Producto en mal estado",
  error_humano: "Error humano",
};

export interface ProductoMerma {
  id: string;
  categoria: string;
  nombre: string;
  unidad: string;
  orden: number;
  activo: boolean;
}

export interface Merma {
  id: string;
  fecha: string;
  producto_id: string;
  cantidad: number;
  motivo: MotivoMerma;
  empleado: string;
  registrado_por: string;
  creado_en: string;
}

export interface CierreMerma {
  fecha: string;
  capturado_dodo: boolean;
  cerrado_por: string;
  cerrado_en: string;
}

export interface NormaMasa {
  hora: number;
  bolas_25: number;
  bolas_30: number;
  bolas_35: number;
}

export interface LecturaMasa {
  id: string;
  fecha: string;
  hora: number;
  temp_area: TempArea;
  bolas: number;
  temperatura: number;
  en_norma: boolean;
  comentario: string | null;
  registrado_por: string;
  creado_en: string;
}

export interface Checklist {
  id: string;
  clave: string;
  nombre: string;
  horas: number[];
  roles: Rol[];
  tipo: "recorrido" | "lista";
  en_ronda: boolean;
  orden: number;
}

export interface PuntoChecklist {
  id: string;
  checklist_id: string;
  orden: number;
  texto: string;
  detalle_por_hora: Record<string, string> | null;
  momento: Momento;
  dia_semana: number | null;
}

// ─── Checklists de zonas ────────────────────────────────────────────────────
export type Momento = "apertura" | "cambio" | "durante_manana" | "durante_tarde" | "cierre" | "hora" | "semanal";

export interface RegistroChecklist {
  id: string;
  checklist_id: string;
  fecha: string;
  momento: Momento;
  hora: number | null;
  empleado: string;
  registrado_por: string;
  creado_en: string;
  revisado_por: string | null;
  revisado_en: string | null;
  registro_respuestas: { punto_id: string; cumple: boolean; comentario: string | null }[];
}

export interface LoteAmasado {
  id: string; fecha: string; inicio: string; fin: string; temp_area: TempArea;
  plan_bolas: number; bolas_resultado: number;
  temp_sala: number; temp_harina: number; temp_agua: number; temp_masa: number;
  g_agua: number; g_sal: number; g_azucar: number; g_aceite: number; g_harina: number; g_levadura: number;
  minutos_amasado: number; empleado: string; comentario: string | null;
  registrado_por: string; creado_en: string; revisado_por: string | null; revisado_en: string | null;
}

export interface AreaLimpieza { semana: 1 | 2; dia_semana: number; area: string }

export interface LimpiezaProfunda {
  id: string; fecha: string; area: string; empleado: string;
  registrado_por: string; creado_en: string; revisado_por: string | null; revisado_en: string | null;
}

export interface ObjetivoTurno {
  id: string; fecha: string; turno: "manana" | "tarde"; empleado: string; objetivo: string;
  registrado_por: string; creado_en: string;
}
