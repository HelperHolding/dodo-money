import type { Hoja } from "../ventas/xlsx";

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
  /** Nuestro número de cliente con el proveedor (opcional). */
  numero_cliente: string | null;
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

  const numero_cliente = opcional(valor("numero_cliente"));
  if (numero_cliente && numero_cliente.length > 60) return { error: "El número de cliente es de hasta 60 caracteres." };

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
      dias_credito, forma_pago_habitual: forma as FormaPago, categorias, notas: opcional(valor("notas")), numero_cliente,
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


export const SIN_RENGLONES = "El archivo no trae proveedores (la primera fila son los encabezados).";
export const MAX_PROVEEDORES = 500;

/** Columnas que se reconocen en la primera fila (sin importar mayúsculas, acentos ni orden). */
export const ENCABEZADOS = [
  { texto: "Razón social", campo: "razon_social", obligatorio: true },
  { texto: "Nombre comercial", campo: "nombre_comercial", obligatorio: false },
  { texto: "RFC", campo: "rfc", obligatorio: true },
  { texto: "Régimen fiscal", campo: "regimen_fiscal", obligatorio: true },
  { texto: "Contacto", campo: "contacto_nombre", obligatorio: false },
  { texto: "Teléfono", campo: "telefono", obligatorio: false },
  { texto: "Correo", campo: "correo", obligatorio: false },
  { texto: "Banco", campo: "banco", obligatorio: false },
  { texto: "CLABE", campo: "clabe", obligatorio: false },
  { texto: "Cuenta", campo: "cuenta", obligatorio: false },
  { texto: "Días de crédito", campo: "dias_credito", obligatorio: false },
  { texto: "Forma de pago", campo: "forma_pago_habitual", obligatorio: false },
  { texto: "Número de cliente", campo: "numero_cliente", obligatorio: false },
  { texto: "Categorías", campo: "categorias", obligatorio: false },
  { texto: "Notas", campo: "notas", obligatorio: false },
] as const;

type Encabezado = { texto: string; campo: string; obligatorio: boolean };
type Renglon = { n: number; crudo: (campo: string) => string | number | undefined };

/** "AB12" → { columna: "AB", fila: 12 }. */
function partirReferencia(ref: string) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? { columna: m[1], fila: Number(m[2]) } : null;
}

/**
 * Renglones con datos de una hoja cuya primera fila son encabezados (reconocidos sin importar mayúsculas, acentos ni orden).
 * Devuelve el error de columnas faltantes, de hoja vacía o de demasiados renglones.
 */
function renglonesDeHoja(hoja: Hoja, encabezados: readonly Encabezado[], vacia: string, max: number, plural: string): { renglones: Renglon[] } | { errores: string[] } {
  const campoPorClave = new Map<string, string>(encabezados.map((e) => [clave(e.texto), e.campo]));
  const filas = new Map<number, Map<string, string | number>>();
  for (const [ref, valor] of hoja.celdas) {
    const p = partirReferencia(ref);
    if (!p) continue;
    if (!filas.has(p.fila)) filas.set(p.fila, new Map());
    filas.get(p.fila)!.set(p.columna, valor);
  }

  const columnaDe = new Map<string, string>();
  for (const [columna, valor] of filas.get(1) ?? []) {
    const campo = campoPorClave.get(clave(String(valor)));
    if (campo && !columnaDe.has(campo)) columnaDe.set(campo, columna);
  }
  const faltan = encabezados.filter((e) => e.obligatorio && !columnaDe.has(e.campo));
  if (faltan.length) return { errores: faltan.map((e) => `Falta la columna "${e.texto}" en la primera fila.`) };

  const numeros = [...filas.keys()].filter((n) => n > 1 && [...filas.get(n)!.values()].some((v) => String(v).trim() !== "")).sort((a, b) => a - b);
  if (!numeros.length) return { errores: [vacia] };
  if (numeros.length > max) return { errores: [`El archivo trae más de ${max} ${plural}; divídelo en varios.`] };

  return {
    renglones: numeros.map((n) => {
      const fila = filas.get(n)!;
      return { n, crudo: (campo: string) => { const c = columnaDe.get(campo); return c === undefined ? undefined : fila.get(c); } };
    }),
  };
}

export function leerCargaProveedores(hoja: Hoja, rfcsExistentes: ReadonlySet<string>): { proveedores: DatosProveedor[]; errores: string[] } {
  const leidos = renglonesDeHoja(hoja, ENCABEZADOS, SIN_RENGLONES, MAX_PROVEEDORES, "proveedores");
  if ("errores" in leidos) return { proveedores: [], errores: leidos.errores };

  const proveedores: DatosProveedor[] = [];
  const errores: string[] = [];
  const renglonDeRfc = new Map<string, number>();
  for (const { n, crudo } of leidos.renglones) {
    if (typeof crudo("clabe") === "number") {
      errores.push(`Renglón ${n}: la CLABE llegó como número y Excel pudo cambiarla; dale formato de texto a esa columna.`);
      continue;
    }
    if (typeof crudo("cuenta") === "number") {
      errores.push(`Renglón ${n}: la cuenta llegó como número y Excel pudo quitarle ceros; dale formato de texto a esa columna.`);
      continue;
    }
    const r = leerProveedor((campo) => String(crudo(campo) ?? ""));
    if ("error" in r) { errores.push(`Renglón ${n}: ${r.error}`); continue; }
    const previo = renglonDeRfc.get(r.datos.rfc);
    if (previo !== undefined) { errores.push(`Renglón ${n}: el RFC ${r.datos.rfc} está repetido en el archivo (renglón ${previo}).`); continue; }
    renglonDeRfc.set(r.datos.rfc, n);
    if (rfcsExistentes.has(r.datos.rfc)) { errores.push(`Renglón ${n}: el RFC ${r.datos.rfc} ya está en la cartera.`); continue; }
    proveedores.push(r.datos);
  }
  return errores.length ? { proveedores: [], errores } : { proveedores, errores };
}

export const SIN_ARTICULOS = "El archivo no trae artículos (la primera fila son los encabezados).";
export const MAX_ARTICULOS = 1000;

export const ENCABEZADOS_ARTICULOS = [
  { texto: "Nombre", campo: "nombre", obligatorio: true },
  { texto: "Unidad", campo: "unidad", obligatorio: true },
  { texto: "Tipo", campo: "tipo", obligatorio: true },
  { texto: "IVA", campo: "tasa_iva", obligatorio: false },
  { texto: "ID de insumo Dodo IS", campo: "dodo_insumo_id", obligatorio: false },
  { texto: "Proveedores", campo: "proveedores", obligatorio: false },
] as const;

/** Proveedor por nombre comercial, razón social o RFC (sin importar mayúsculas ni acentos); null = el nombre lo comparten varios. */
export type IndiceProveedores = ReadonlyMap<string, string | null>;

export function indiceProveedores(lista: readonly { id: string; razon_social: string; nombre_comercial: string | null; rfc: string }[]): IndiceProveedores {
  const indice = new Map<string, string | null>();
  for (const p of lista) {
    for (const texto of [p.nombre_comercial, p.razon_social, p.rfc]) {
      if (!texto?.trim()) continue;
      const k = clave(texto);
      indice.set(k, indice.has(k) && indice.get(k) !== p.id ? null : p.id);
    }
  }
  return indice;
}

/** Proveedores que surten un artículo, como llegan del formulario: casillas y el principal. */
export function leerSeleccionProveedores(elegidos: readonly string[], principal: string): Resultado<{ proveedores: string[]; principal: string | null }> {
  const proveedores = [...new Set(elegidos.filter(Boolean))];
  if (!proveedores.length) return { datos: { proveedores, principal: null } };
  if (!principal) return { datos: { proveedores, principal: proveedores[0] } };
  if (!proveedores.includes(principal)) return { error: "El proveedor principal tiene que estar entre los que lo surten." };
  return { datos: { proveedores, principal } };
}

/** IVA como lo escriben: 16, "16 %", 0.16 (Excel con formato de porcentaje), 0, "Exento". Vacío = 16. */
function tasaDeCelda(valor: string | number | undefined): string | null {
  if (valor === undefined || String(valor).trim() === "") return "16";
  if (typeof valor === "number") return valor === 16 || valor === 0.16 ? "16" : valor === 0 ? "0" : null;
  const t = clave(valor).replace(/[%_]/g, "");
  return t === "16" || t === "0" || t === "exento" ? t : null;
}

/**
 * Lee la hoja de artículos. `existentes`: nombres del catálogo en minúsculas e IDs de Dodo IS ya usados.
 * Si un renglón falla no devuelve ninguno.
 */
export function leerCargaArticulos(
  hoja: Hoja, existentes: { nombres: ReadonlySet<string>; ids: ReadonlySet<string>; proveedores?: IndiceProveedores },
): { articulos: DatosArticulo[]; errores: string[]; ligas: { nombre: string; proveedores: string[] }[] } {
  const leidos = renglonesDeHoja(hoja, ENCABEZADOS_ARTICULOS, SIN_ARTICULOS, MAX_ARTICULOS, "artículos");
  if ("errores" in leidos) return { articulos: [], errores: leidos.errores, ligas: [] };

  const articulos: DatosArticulo[] = [];
  const ligas: { nombre: string; proveedores: string[] }[] = [];
  const errores: string[] = [];
  const renglonDeNombre = new Map<string, number>();
  const renglonDeId = new Map<string, number>();
  for (const { n, crudo } of leidos.renglones) {
    const textoTipo = String(crudo("tipo") ?? "").trim();
    const tipo = clave(textoTipo);
    if (!(CATEGORIAS_COMPRA as readonly string[]).includes(tipo)) {
      errores.push(`Renglón ${n}: Tipo no reconocido: ${textoTipo || "(vacío)"} (Consumible, Activo fijo, Servicio u Otro).`);
      continue;
    }
    const tasa = tasaDeCelda(crudo("tasa_iva"));
    if (tasa === null) { errores.push(`Renglón ${n}: IVA no reconocido: ${crudo("tasa_iva")} (16, 0 o Exento).`); continue; }

    const r = leerArticulo((campo) => (campo === "tipo" ? tipo : campo === "tasa_iva" ? tasa : String(crudo(campo) ?? "")));
    if ("error" in r) { errores.push(`Renglón ${n}: ${r.error}`); continue; }
    const { nombre, dodo_insumo_id: id } = r.datos;

    const previo = renglonDeNombre.get(nombre.toLowerCase());
    if (previo !== undefined) { errores.push(`Renglón ${n}: el artículo ${nombre} está repetido en el archivo (renglón ${previo}).`); continue; }
    renglonDeNombre.set(nombre.toLowerCase(), n);
    if (id) {
      const previoId = renglonDeId.get(id);
      if (previoId !== undefined) { errores.push(`Renglón ${n}: el ID de Dodo IS ${id} está repetido en el archivo (renglón ${previoId}).`); continue; }
      renglonDeId.set(id, n);
    }
    if (existentes.nombres.has(nombre.toLowerCase())) { errores.push(`Renglón ${n}: ya hay un artículo llamado ${nombre}.`); continue; }
    if (id && existentes.ids.has(id)) { errores.push(`Renglón ${n}: el ID de Dodo IS ${id} ya está en otro artículo.`); continue; }

    // Proveedores separados por coma o punto y coma; el primero queda como principal.
    const nombres = String(crudo("proveedores") ?? "").split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    const ids: string[] = [];
    let problema: string | null = null;
    for (const texto of nombres) {
      const encontrado = existentes.proveedores?.get(clave(texto));
      if (encontrado === undefined) { problema = `no encontré al proveedor ${texto} (escribe su nombre comercial, razón social o RFC).`; break; }
      if (encontrado === null) { problema = `hay varios proveedores llamados ${texto}; usa su RFC.`; break; }
      if (!ids.includes(encontrado)) ids.push(encontrado);
    }
    if (problema) { errores.push(`Renglón ${n}: ${problema}`); continue; }
    articulos.push(r.datos);
    if (ids.length) ligas.push({ nombre, proveedores: ids });
  }
  return errores.length ? { articulos: [], errores, ligas: [] } : { articulos, errores, ligas };
}

/** Desactivar exige motivo (quién y cuándo los pone la base); reactivar lo borra. `activo` = "si" o "no" del formulario. */
export function leerDesactivacion(activo: string, motivo: string): Resultado<{ activo: boolean; motivo_desactivacion: string | null }> {
  if (activo === "si") return { datos: { activo: true, motivo_desactivacion: null } };
  const texto = motivo.trim();
  if (!texto) return { error: "Escribe por qué se desactiva." };
  return { datos: { activo: false, motivo_desactivacion: texto } };
}
