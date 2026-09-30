/** Catálogo c_RegimenFiscal del SAT (CFDI 4.0). */
export const REGIMENES: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "607": "Régimen de Enajenación o Adquisición de Bienes",
  "608": "Demás ingresos",
  "610": "Residentes en el Extranjero sin Establecimiento Permanente en México",
  "611": "Ingresos por Dividendos (socios y accionistas)",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "614": "Ingresos por intereses",
  "615": "Régimen de los ingresos por obtención de premios",
  "616": "Sin obligaciones fiscales",
  "620": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  "621": "Incorporación Fiscal",
  "622": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  "623": "Opcional para Grupos de Sociedades",
  "624": "Coordinados",
  "625": "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
  "628": "Hidrocarburos",
  "629": "De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales",
  "630": "Enajenación de acciones en bolsa de valores",
};

export const nombreRegimen = (clave: string) => REGIMENES[clave] ?? clave;


export const CATEGORIAS_COMPRA = ["consumible", "activo_fijo", "servicio", "otro"] as const;
export type CategoriaCompra = (typeof CATEGORIAS_COMPRA)[number];
export const NOMBRE_CATEGORIA_COMPRA: Record<CategoriaCompra, string> = {
  consumible: "Consumible", activo_fijo: "Activo fijo", servicio: "Servicio", otro: "Otro",
};

export const FORMAS_PAGO = ["transferencia", "efectivo", "tarjeta", "cheque"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];
export const NOMBRE_FORMA_PAGO: Record<FormaPago, string> = {
  transferencia: "Transferencia", efectivo: "Efectivo", tarjeta: "Tarjeta", cheque: "Cheque",
};

export const TASAS_IVA = ["16", "0", "exento"] as const;
export type TasaIva = (typeof TASAS_IVA)[number];
export const NOMBRE_TASA_IVA: Record<TasaIva, string> = { "16": "IVA 16 %", "0": "IVA 0 %", exento: "Exento" };

/** "Activo fijo" → "activo_fijo": minúsculas, sin acentos, espacios y guiones a "_". */
export const clave = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const opcional = (t: string) => t.trim() || null;

export const normalizarRfc = (t: string) => t.toUpperCase().replace(/[\s-]/g, "");
export const rfcValido = (rfc: string) => /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc);

/** Dígito verificador de Banxico: pesos 3, 7, 1 sobre los primeros 17 dígitos, módulo 10. */
export function clabeValida(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(clabe[i]) * [3, 7, 1][i % 3]) % 10;
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

export type DatosProveedor = {
  razon_social: string; nombre_comercial: string | null; rfc: string; regimen_fiscal: string;
  contacto_nombre: string | null; telefono: string | null; correo: string | null;
  banco: string | null; clabe: string | null; cuenta: string | null;
  dias_credito: number; forma_pago_habitual: FormaPago; categorias: CategoriaCompra[]; notas: string | null;
};

type Resultado<T> = { datos: T } | { error: string };

/** Lee y valida un proveedor; `valor(campo)` devuelve el texto del formulario o de la celda del Excel. */
export function leerProveedor(valor: (campo: string) => string): Resultado<DatosProveedor> {
  const razon_social = valor("razon_social").trim();
  if (!razon_social) return { error: "Escribe la razón social." };

  const rfc = normalizarRfc(valor("rfc"));
  if (!rfcValido(rfc)) return { error: `El RFC ${rfc || "(vacío)"} no es válido (12 caracteres para empresa, 13 para persona física).` };

  const regimen_fiscal = valor("regimen_fiscal").trim().slice(0, 3);
  if (!REGIMENES[regimen_fiscal]) return { error: "Elige un régimen fiscal del catálogo del SAT." };

  const clabe = opcional(valor("clabe").replace(/\s/g, ""));
  if (clabe && !clabeValida(clabe)) return { error: "La CLABE no es válida: deben ser 18 dígitos y revisa el último." };

  const correo = opcional(valor("correo").toLowerCase());
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "El correo no es válido." };

  const textoDias = valor("dias_credito").trim();
  const dias_credito = textoDias === "" ? 0 : Number(textoDias);
  if (!Number.isInteger(dias_credito) || dias_credito < 0 || dias_credito > 365) return { error: "Los días de crédito van de 0 a 365." };

  const textoForma = valor("forma_pago_habitual").trim();
  const forma = textoForma === "" ? "transferencia" : clave(textoForma);
  if (!(FORMAS_PAGO as readonly string[]).includes(forma)) return { error: `Forma de pago no reconocida: ${textoForma}.` };

  const categorias: CategoriaCompra[] = [];
  for (const parte of valor("categorias").split(",").map((p) => p.trim()).filter(Boolean)) {
    const c = clave(parte);
    if (!(CATEGORIAS_COMPRA as readonly string[]).includes(c)) return { error: `Categoría no reconocida: ${parte}.` };
    if (!categorias.includes(c as CategoriaCompra)) categorias.push(c as CategoriaCompra);
  }

  return {
    datos: {
      razon_social, nombre_comercial: opcional(valor("nombre_comercial")), rfc, regimen_fiscal,
      contacto_nombre: opcional(valor("contacto_nombre")), telefono: opcional(valor("telefono")), correo,
      banco: opcional(valor("banco")), clabe, cuenta: opcional(valor("cuenta")),
      dias_credito, forma_pago_habitual: forma as FormaPago, categorias, notas: opcional(valor("notas")),
    },
  };
}

export type DatosArticulo = { nombre: string; unidad: string; tipo: CategoriaCompra; tasa_iva: TasaIva; dodo_insumo_id: string | null };

export function leerArticulo(valor: (campo: string) => string): Resultado<DatosArticulo> {
  const nombre = valor("nombre").trim();
  if (!nombre) return { error: "Escribe el nombre del artículo." };
  const unidad = valor("unidad").trim();
  if (!unidad) return { error: "Escribe la unidad (kg, pza, caja, servicio…)." };
  const tipo = valor("tipo");
  if (!(CATEGORIAS_COMPRA as readonly string[]).includes(tipo)) return { error: "Elige el tipo de artículo." };
  const tasa_iva = valor("tasa_iva");
  if (!(TASAS_IVA as readonly string[]).includes(tasa_iva)) return { error: "Elige la tasa de IVA." };
  const dodo_insumo_id = opcional(valor("dodo_insumo_id").toUpperCase());
  if (dodo_insumo_id && tipo !== "consumible") return { error: "Solo los consumibles llevan ID de insumo de Dodo IS." };
  if (dodo_insumo_id && !/^[0-9A-F]{32}$/.test(dodo_insumo_id)) return { error: "El ID de insumo de Dodo IS son 32 caracteres (0-9 y A-F)." };
  return { datos: { nombre, unidad, tipo: tipo as CategoriaCompra, tasa_iva: tasa_iva as TasaIva, dodo_insumo_id } };
}
