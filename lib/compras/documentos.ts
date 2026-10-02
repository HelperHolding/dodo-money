/** Documentos de cada proveedor: se guarda cada versión; la vigente es la de fecha más reciente. */

export const TIPOS_DOCUMENTO = ["opinion_cumplimiento", "constancia_fiscal", "caratula_banco"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  opinion_cumplimiento: "Opinión de cumplimiento",
  constancia_fiscal: "Constancia de situación fiscal",
  caratula_banco: "Carátula de cuenta bancaria",
};

/** La opinión de cumplimiento del SAT se pide con a lo más 30 días de antigüedad. */
export const DIAS_OPINION = 30;
/** Vercel corta las peticiones de más de 4.5 MB: el archivo tiene que caber con el resto del formulario. */
export const MAX_BYTES_DOCUMENTO = 4 * 1024 * 1024;

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

const dia = (f: string) => Date.parse(`${f}T00:00:00Z`) / 86_400_000;

export const opinionVencida = (fecha: string, hoy: string) => dia(hoy) - dia(fecha) > DIAS_OPINION;

export function estadoDocumentos(docs: readonly Documento[], hoy: string) {
  const v = vigentes(docs);
  const faltan = TIPOS_DOCUMENTO.filter((t) => !v[t]);
  const vencida = !!v.opinion_cumplimiento && opinionVencida(v.opinion_cumplimiento.fecha, hoy);
  return { faltan, opinionVencida: vencida, pendiente: faltan.length > 0 || vencida };
}

const fechaReal = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f;

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
