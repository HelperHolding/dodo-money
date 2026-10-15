/** Documentos de cada proveedor: se guarda cada versión; la vigente es la de fecha más reciente. */

export const TIPOS_DOCUMENTO = ["opinion_cumplimiento", "constancia_fiscal", "caratula_banco"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  opinion_cumplimiento: "Opinión de cumplimiento",
  constancia_fiscal: "Constancia de situación fiscal",
  caratula_banco: "Carátula de cuenta bancaria",
};

/** Vercel corta las peticiones de más de 4.5 MB: el archivo tiene que caber con el resto del formulario. */
export const MAX_BYTES_DOCUMENTO = 4 * 1024 * 1024;

export const DOCUMENTOS_ALTA = ["caratula_banco", "opinion_cumplimiento"] as const;
/** Tres adjuntos comparten una petición: deja margen para los campos y multipart en Vercel. */
export const MAX_BYTES_ALTA = 4 * 1024 * 1024;
export function validarDocumentosAlta(fd: FormData, hoy: string): string | null {
  const archivo = (campo: string) => {
    const v = fd.get(campo);
    return v instanceof File && v.size > 0 ? v : null;
  };
  for (const tipo of DOCUMENTOS_ALTA) {
    const a = archivo(tipo);
    if (!a) continue;
    if (!extensionDocumento(a.type)) return `${NOMBRE_DOCUMENTO[tipo]} debe ser PDF o foto (JPG, PNG o WebP).`;
    const fecha = leerDocumento(tipo, String(fd.get(`${tipo}_fecha`) ?? ""), hoy);
    if ("error" in fecha) return `${NOMBRE_DOCUMENTO[tipo]}: ${fecha.error}`;
  }
  const constancia = archivo("constancia");
  if (constancia && constancia.type !== "application/pdf") return "La constancia fiscal debe ser PDF.";
  const total = [...DOCUMENTOS_ALTA, "constancia"].reduce((n,c) => n + (archivo(c)?.size ?? 0), 0);
  return total > MAX_BYTES_ALTA ? "Los documentos juntos deben pesar como máximo 4 MB. Reduce su tamaño antes de enviar." : null;
}

export type Documento = { id: string; tipo: TipoDocumento; fecha: string; subido_en: string };

/** El vigente de cada tipo: fecha más reciente y, si empatan, el último que se subió. */
export function vigentes<D extends Documento>(docs: readonly D[]): Record<TipoDocumento, D | null> {
  const r: Record<TipoDocumento, D | null> = { opinion_cumplimiento: null, constancia_fiscal: null, caratula_banco: null };
  for (const d of docs) {
    const actual = r[d.tipo];
    if (!actual || d.fecha > actual.fecha || (d.fecha === actual.fecha && d.subido_en > actual.subido_en)) r[d.tipo] = d;
  }
  return r;
}

/** Qué documentos faltan por subir. La antigüedad no cuenta: no se avisa de opiniones viejas. */
export function estadoDocumentos(docs: readonly Documento[]) {
  const v = vigentes(docs);
  const faltan = TIPOS_DOCUMENTO.filter((t) => !v[t]);
  return { faltan, pendiente: faltan.length > 0 };
}

const fechaReal = (f: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const fecha = new Date(`${f}T00:00:00Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0,10) === f;
};

export function leerDocumento(tipo: string, fecha: string, hoy: string): { datos: { tipo: TipoDocumento; fecha: string } } | { error: string } {
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) return { error: "Elige qué documento es." };
  const f = fecha.trim();
  if (!fechaReal(f)) return { error: "Escribe la fecha que trae el documento." };
  if (f > hoy) return { error: "La fecha del documento no puede ser futura." };
  return { datos: { tipo: tipo as TipoDocumento, fecha: f } };
}

const EXTENSIONES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const extensionDocumento = (mime: string) => EXTENSIONES[mime] ?? null;

/** Ruta en el bucket: por id del proveedor (el almacenamiento no acepta Ñ ni acentos, y el RFC puede traer Ñ). */
export const rutaDocumento = (proveedorId: string, tipo: TipoDocumento, fecha: string, id: string, extension: string) =>
  `${proveedorId}/${tipo}/${fecha}-${id}.${extension}`;
