/** Reglas de pantalla para sustituir el CFDI de una factura (la base de datos vuelve a validar todo). */
export const MAX_ARCHIVO = 4 * 1024 * 1024;
export const MAX_JUNTOS = 4.5 * 1024 * 1024;

export const CAMPOS_IMPORTE = [
  ["subtotal", "Subtotal"], ["descuento", "Descuento"], ["iva", "IVA"], ["retencion_iva", "Retención IVA"],
  ["retencion_isr", "Retención ISR"], ["retenciones", "Retenciones"], ["total", "Total"],
] as const;
export type CampoImporte = (typeof CAMPOS_IMPORTE)[number][0];

const centavos = (n: unknown) => Math.round(Number(n ?? 0) * 100);

/** Importes que cambian (a centavos) entre la factura registrada y el XML nuevo. */
export function diferenciasImportes(registrado: Partial<Record<CampoImporte, unknown>>, xml: Partial<Record<CampoImporte, unknown>>) {
  return CAMPOS_IMPORTE
    .map(([campo, nombre]) => ({ campo, nombre, registrado: centavos(registrado[campo]) / 100, xml: centavos(xml[campo]) / 100 }))
    .filter((d) => d.registrado !== d.xml)
    .map((d) => ({ ...d, diferencia: Math.round((d.xml - d.registrado) * 100) / 100 }));
}

/** Archivo elegido en el formulario (o nada). Regresa el error para el usuario, o null si está bien. */
export function revisarArchivos(xml: { name: string; size: number } | null, pdf: { name: string; size: number } | null): string | null {
  if (!xml || !xml.name.toLowerCase().endsWith(".xml") || !xml.size || xml.size > MAX_ARCHIVO) return "Selecciona el XML del CFDI nuevo (hasta 4 MB).";
  if (pdf && (!pdf.name.toLowerCase().endsWith(".pdf") || !pdf.size || pdf.size > MAX_ARCHIVO)) return "El PDF debe ser .pdf de hasta 4 MB.";
  // El formulario completo no puede pasar de 5 MB (límite de las acciones del servidor).
  if (pdf && xml.size + pdf.size > MAX_JUNTOS) return "XML y PDF juntos pasan de 4.5 MB. Sube solo el XML y adjunta el PDF después.";
  return null;
}

/** Aviso de complementos de pago (REP) ligados al UUID que se reemplaza. */
export function avisoComplementos(c: { cantidad: number; monto: number } | null | undefined, metodo: string | null): string | null {
  const n = Number(c?.cantidad ?? 0);
  if (n > 0) return `${n === 1 ? "Hay 1 complemento de pago ligado" : `Hay ${n} complementos de pago ligados`} al UUID anterior. Se conservan, pero ya no cubren esta factura: pide al proveedor el REP del UUID nuevo.`;
  if (metodo === "PPD") return "Factura PPD: los pagos necesitarán un complemento (REP) que cite el UUID nuevo.";
  return null;
}

/** El XML nuevo debería relacionar al anterior (TipoRelacion 04). Si no lo hace, solo se avisa. */
export function avisoRelacion(uuidAnterior: string, relacionados: string[] | null | undefined): string | null {
  const r = (relacionados ?? []).map((u) => u.toUpperCase());
  if (!r.length) return "El XML nuevo no indica qué CFDI sustituye. Confirma con el proveedor que el anterior quedó cancelado ante el SAT.";
  return r.includes(uuidAnterior.toUpperCase()) ? null : "El XML relaciona otros CFDI, no el de esta factura.";
}
