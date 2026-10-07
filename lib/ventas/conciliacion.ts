export type ConciliacionVenta = {
 id: string; sucursal_id: string; fecha: string; importacion_id: string;
 efectivo: number; tarjeta: number; en_linea: number; conciliar_productos: boolean;
 motivo: string; registrado_por: string; registrado_en: string; anulado_en: string | null; motivo_anulacion: string | null;
 original: { total: number; iva: number; efectivo: number; tarjeta: number; en_linea: number; suma_productos: number; bruta_productos: number; productos: number };
};

/** Solo se aplica a la misma importación; los reportes originales no se modifican. */
export function aplicarConciliaciones<T extends { sucursal_id: string; fecha: string; importacion_id: string; efectivo: number; tarjeta: number; en_linea: number }>(dias: readonly T[], conciliaciones: readonly ConciliacionVenta[]): (T & { conciliada: boolean })[] {
 const porImportacion = new Map(conciliaciones.filter(c => !c.anulado_en).map(c => [c.importacion_id,c]));
 return dias.map(d => {
  const c = porImportacion.get(d.importacion_id);
  if (!c || c.sucursal_id !== d.sucursal_id || c.fecha !== d.fecha) return { ...d, conciliada: false };
  return { ...d, efectivo: Number(c.efectivo), tarjeta: Number(c.tarjeta), en_linea: Number(c.en_linea), conciliada: c.conciliar_productos };
 });
}
