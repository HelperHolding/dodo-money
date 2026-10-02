/** Vista general de corporativo: datos por sucursal para un día y qué merece atención. */

export type DatosSucursal = {
  id: string;
  nombre: string;
  turnosAbiertos: number;
  turnosCerrados: number;
  diferenciaArqueos: number;
  /** Arqueos de cierre con diferencia: dos turnos que se compensan siguen contando. */
  arqueosDescuadrados: number;
  pendientes: number;
  deposito: number;
  cierre: { cerradoEn: string; ventaTotal: number; bovedaDiferencia: number } | null;
  /** faltantes = horas ya cerradas sin registro. */
  masa: { total: number; registradas: number; faltantes: number; fueraDeNorma: number };
  recorrido: { total: number; hechos: number; faltantes: number; conFallas: number };
  mermasCerradas: boolean;
  mermas: number;
  gastos: number;
  sinComprobante: number;
  /** Gastos que pagaron empleados de su bolsa y aún no se les reponen (de cualquier día). */
  porReponerEmpleados: number;
  /** Ronda de la hora de las zonas: faltantes = horas ya cerradas sin registro. */
  rondas: { total: number; hechas: number; faltantes: number; conFallas: number };
  /** Listas del turno que aplican hoy y cuántas ya se registraron. */
  listas: { total: number; hechas: number };
  amasadoFuera: number;
  limpiezaProfunda: boolean;
};

export type Alerta =
  | "arqueos" | "pendientes" | "deposito" | "cierre" | "boveda"
  | "masa" | "recorrido" | "mermas" | "comprobantes"
  | "rondas" | "listas" | "amasado" | "limpieza";

/** Una diferencia cuenta si no es cero al redondear a centavos. */
const hayDiferencia = (n: number) => Math.round(n * 100) !== 0;

export function alertasDeSucursal(d: DatosSucursal, diaTerminado: boolean): Alerta[] {
  const alertas: Alerta[] = [];
  if (hayDiferencia(d.diferenciaArqueos) || d.arqueosDescuadrados > 0) alertas.push("arqueos");
  if (d.pendientes > 0) alertas.push("pendientes");
  if (d.cierre && !hayDiferencia(d.deposito)) alertas.push("deposito");
  if (!d.cierre && diaTerminado) alertas.push("cierre");
  if (d.cierre && hayDiferencia(d.cierre.bovedaDiferencia)) alertas.push("boveda");
  if (d.masa.faltantes > 0 || d.masa.fueraDeNorma > 0) alertas.push("masa");
  if (d.recorrido.faltantes > 0 || d.recorrido.conFallas > 0) alertas.push("recorrido");
  if (!d.mermasCerradas && diaTerminado) alertas.push("mermas");
  if (d.sinComprobante > 0) alertas.push("comprobantes");
  if (d.rondas.faltantes > 0 || d.rondas.conFallas > 0) alertas.push("rondas");
  if (d.listas.hechas < d.listas.total && diaTerminado) alertas.push("listas");
  if (d.amasadoFuera > 0) alertas.push("amasado");
  if (!d.limpiezaProfunda && diaTerminado) alertas.push("limpieza");
  return alertas;
}

/** Las sucursales con alertas primero; dentro de cada grupo, por nombre. */
export function ordenarSucursales<T extends { nombre: string; alertas: readonly Alerta[] }>(filas: readonly T[]): T[] {
  return [...filas].sort(
    (a, b) => Number(b.alertas.length > 0) - Number(a.alertas.length > 0) || a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** Fecha YYYY-MM-DD que existe en el calendario (descarta 2026-02-31 o 2026-00-10). */
function fechaReal(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** La fecha pedida en la URL si existe y no es futura; si no, hoy. */
export function fechaElegida(pedida: string | undefined, hoy: string): string {
  return pedida && fechaReal(pedida) && pedida <= hoy ? pedida : hoy;
}

/** Mensaje del primer resultado con error, o null. Si algo no cargó, no se muestra un "todo en orden" falso. */
export function primerError(resultados: readonly { error: { message: string } | null }[]): string | null {
  return resultados.find((r) => r.error)?.error?.message ?? null;
}
