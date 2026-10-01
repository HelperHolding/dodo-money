/** Factura de proveedor leída de su XML (CFDI 3.3 o 4.0). Montos tal como vienen; fecha sin hora. */
export type Cfdi = {
  uuid: string; version: string; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha: string;
  rfc_emisor: string; nombre_emisor: string; regimen_emisor: string; rfc_receptor: string;
  metodo_pago: "PUE" | "PPD" | null; forma_pago: string | null; moneda: string;
  subtotal: number; descuento: number; iva: number; retenciones: number; total: number;
  /** Primera factura que corrige (egreso); `uuids_relacionados` trae todas. */
  uuid_relacionado: string | null; uuids_relacionados: string[];
  conceptos: { descripcion: string; cantidad: number; unidad: string; valor_unitario: number; importe: number }[];
};

export const NO_ES_CFDI = "El archivo no es un XML de factura (CFDI) válido.";

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const desescapar = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e.toLowerCase()]);

/** Todas las etiquetas de apertura `<prefijo:Nombre …>` (con o sin prefijo). Un ">" entre comillas no corta la etiqueta. */
const etiquetas = (xml: string, nombre: string) =>
  [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${nombre}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "g"))].map((m) => m[0]);
const etiqueta = (xml: string, nombre: string) => etiquetas(xml, nombre)[0];

/** Valor de un atributo, con comillas dobles o simples, ya sin entidades. */
function atributo(tag: string | undefined, nombre: string): string | null {
  if (!tag) return null;
  const m = new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? desescapar(m[1] ?? m[2]).trim() : null;
}
const monto = (tag: string | undefined, nombre: string) => Number(atributo(tag, nombre) ?? 0) || 0;

export function leerCfdi(xml: string): { cfdi: Cfdi } | { error: string } {
  // La Addenda es libre del proveedor y puede traer etiquetas con los mismos nombres: se ignora.
  const texto = xml.replace(/^\uFEFF/, "").replace(/<(?:[\w-]+:)?Addenda\b[\s\S]*?<\/(?:[\w-]+:)?Addenda>/g, "");
  const comprobante = etiqueta(texto, "Comprobante");
  if (!comprobante) return { error: NO_ES_CFDI };

  const version = atributo(comprobante, "Version");
  if (version !== "4.0" && version !== "3.3") return { error: `Versión de CFDI no soportada (${version ?? "sin versión"}); se aceptan 3.3 y 4.0.` };

  const uuid = atributo(etiqueta(texto, "TimbreFiscalDigital"), "UUID");
  if (!uuid) return { error: "La factura no está timbrada (no trae folio fiscal UUID)." };

  const letra = atributo(comprobante, "TipoDeComprobante");
  if (letra === "P") return { error: "Es un complemento de pago: se sube en Pagos." };
  if (letra !== "I" && letra !== "E") return { error: `Un comprobante de tipo ${letra ?? "?"} no se registra como factura de proveedor.` };

  const moneda = atributo(comprobante, "Moneda") ?? "MXN";
  if (moneda !== "MXN") return { error: `La factura está en ${moneda}; por ahora solo se registran en pesos (MXN).` };

  const emisor = etiqueta(texto, "Emisor");
  const receptor = etiqueta(texto, "Receptor");
  const fecha = atributo(comprobante, "Fecha") ?? "";
  if (!emisor || !receptor || !/^\d{4}-\d{2}-\d{2}T/.test(fecha)) return { error: NO_ES_CFDI };

  // Los Impuestos de cada concepto no traen totales; los del comprobante sí.
  const impuestos = etiquetas(texto, "Impuestos").find((t) => /\sTotalImpuestos(?:Trasladados|Retenidos)\s*=/.test(t));
  const metodo = atributo(comprobante, "MetodoPago");
  const relacionados = etiquetas(texto, "CfdiRelacionado").map((t) => atributo(t, "UUID")?.toUpperCase()).filter((u): u is string => !!u);
  // Solo los conceptos del comprobante (no los de complementos).
  const bloqueConceptos = /<(?:[\w-]+:)?Conceptos\b[\s\S]*?<\/(?:[\w-]+:)?Conceptos>/.exec(texto)?.[0] ?? "";

  return {
    cfdi: {
      uuid: uuid.toUpperCase(), version, serie: atributo(comprobante, "Serie"), folio: atributo(comprobante, "Folio"),
      tipo: letra === "I" ? "ingreso" : "egreso", fecha: fecha.slice(0, 10),
      rfc_emisor: (atributo(emisor, "Rfc") ?? "").toUpperCase(), nombre_emisor: atributo(emisor, "Nombre") ?? "",
      regimen_emisor: atributo(emisor, "RegimenFiscal") ?? "", rfc_receptor: (atributo(receptor, "Rfc") ?? "").toUpperCase(),
      metodo_pago: metodo === "PUE" || metodo === "PPD" ? metodo : null, forma_pago: atributo(comprobante, "FormaPago"), moneda,
      subtotal: monto(comprobante, "SubTotal"), descuento: monto(comprobante, "Descuento"),
      iva: monto(impuestos, "TotalImpuestosTrasladados"), retenciones: monto(impuestos, "TotalImpuestosRetenidos"),
      total: monto(comprobante, "Total"),
      uuid_relacionado: relacionados[0] ?? null, uuids_relacionados: relacionados,
      conceptos: etiquetas(bloqueConceptos, "Concepto").map((c) => ({
        descripcion: atributo(c, "Descripcion") ?? "", cantidad: monto(c, "Cantidad"),
        unidad: atributo(c, "Unidad") ?? atributo(c, "ClaveUnidad") ?? "",
        valor_unitario: monto(c, "ValorUnitario"), importe: monto(c, "Importe"),
      })),
    },
  };
}

/** Complemento de pago (CFDI tipo P, Pagos 1.0 o 2.0): qué facturas paga y cuánto. */
export type ComplementoPago = {
  uuid: string; fecha: string; rfc_emisor: string; nombre_emisor: string; rfc_receptor: string; monto: number;
  documentos: { uuid: string; monto_pagado: number; parcialidad: number | null }[];
};

export function leerComplementoPago(xml: string): { complemento: ComplementoPago } | { error: string } {
  const texto = xml.replace(/^\uFEFF/, "").replace(/<(?:[\w-]+:)?Addenda\b[\s\S]*?<\/(?:[\w-]+:)?Addenda>/g, "");
  const comprobante = etiqueta(texto, "Comprobante");
  if (!comprobante) return { error: NO_ES_CFDI };
  const letra = atributo(comprobante, "TipoDeComprobante");
  if (letra !== "P") return { error: `No es un complemento de pago (es tipo ${letra ?? "?"}): las facturas se suben en Facturas.` };
  const uuid = atributo(etiqueta(texto, "TimbreFiscalDigital"), "UUID");
  if (!uuid) return { error: "El complemento no está timbrado (no trae folio fiscal UUID)." };
  const emisor = etiqueta(texto, "Emisor");
  const receptor = etiqueta(texto, "Receptor");
  if (!emisor || !receptor) return { error: NO_ES_CFDI };

  const pagos = etiquetas(texto, "Pago");
  const documentos = etiquetas(texto, "DoctoRelacionado").map((d) => ({
    uuid: (atributo(d, "IdDocumento") ?? "").toUpperCase(),
    monto_pagado: monto(d, "ImpPagado"),
    parcialidad: atributo(d, "NumParcialidad") ? Number(atributo(d, "NumParcialidad")) : null,
  })).filter((d) => d.uuid);
  if (!documentos.length) return { error: "El complemento no dice qué facturas paga." };

  const fechaPago = atributo(pagos[0], "FechaPago") ?? atributo(comprobante, "Fecha") ?? "";
  return {
    complemento: {
      uuid: uuid.toUpperCase(), fecha: fechaPago.slice(0, 10),
      rfc_emisor: (atributo(emisor, "Rfc") ?? "").toUpperCase(), nombre_emisor: atributo(emisor, "Nombre") ?? "",
      rfc_receptor: (atributo(receptor, "Rfc") ?? "").toUpperCase(),
      monto: Math.round(pagos.reduce((s, p) => s + monto(p, "Monto"), 0) * 100) / 100,
      documentos,
    },
  };
}
