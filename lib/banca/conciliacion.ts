/** Conciliación bancaria: conceptos de flujo y sugerencias (puras) del documento que corresponde a cada movimiento. Nada se guarda aquí. */
import type { CuentaPl } from "../finanzas/cuentas";

export const CONCEPTOS = [
  { clave: "cobranza_tarjeta", nombre: "Cobranza tarjeta (NetPay)", grupo: "operacion" },
  { clave: "cobranza_rappi", nombre: "Cobranza Rappi", grupo: "operacion" },
  { clave: "deposito_efectivo", nombre: "Depósito de efectivo", grupo: "operacion" },
  { clave: "proveedores", nombre: "Proveedores", grupo: "operacion" },
  { clave: "nomina", nombre: "Nómina", grupo: "operacion" },
  { clave: "imss_impuestos", nombre: "IMSS e impuestos", grupo: "operacion" },
  { clave: "renta", nombre: "Renta", grupo: "operacion" },
  { clave: "servicios", nombre: "Servicios", grupo: "operacion" },
  { clave: "marketing", nombre: "Marketing", grupo: "operacion" },
  { clave: "regalias", nombre: "Regalías", grupo: "operacion" },
  { clave: "comisiones_bancarias", nombre: "Comisiones bancarias", grupo: "operacion" },
  { clave: "comisiones_cobro", nombre: "Comisiones de cobro", grupo: "operacion" },
  { clave: "otros_operacion", nombre: "Otros de operación", grupo: "operacion" },
  { clave: "capex", nombre: "CapEx", grupo: "inversion" },
  { clave: "apertura", nombre: "Apertura y equipamiento", grupo: "inversion" },
  { clave: "prestamo_recibido", nombre: "Préstamo recibido", grupo: "financiamiento" },
  { clave: "pago_capital", nombre: "Pago de capital", grupo: "financiamiento" },
  { clave: "intereses", nombre: "Intereses", grupo: "financiamiento" },
  { clave: "traspaso_interno", nombre: "Traspaso interno (fuera del flujo)", grupo: "excluido" },
] as const;
export type Concepto = (typeof CONCEPTOS)[number]["clave"];
export const TIPOS = ["pago_proveedor", "cobro_tarjeta", "cobro_rappi", "nomina", "sin_documento"] as const;
export type TipoConciliacion = (typeof TIPOS)[number];

/** El Excel de Banregio recorta la descripción a ~60 caracteres; parte de la información vive en la referencia, así que las reglas leen descripción y referencia (`textoDe`). CLABE: solo descripción. */
export type MovimientoBanco = { id: string; fecha: string; fila: number; descripcion: string; referencia: string; cargo: number; abono: number };
export type PagoCandidato = { id: string; fecha: string; monto: number; clabe: string | null; proveedor: string; cuenta: CuentaPl | null };
export type VentaTarjeta = { id: string; fecha: string; tarjeta: number };
export type LoteRappi = { importacionId: string; lote: string; neto: number };
export type Documentos = { pagos: readonly PagoCandidato[]; ventas: readonly VentaTarjeta[]; lotesRappi: readonly LoteRappi[] };
export type DocumentoSugerido =
  | { tipo: "pago"; id: string; monto: number; texto: string }
  | { tipo: "venta_dia"; id: string; monto: number; texto: string }
  | { tipo: "rappi_lote"; importacionId: string; lote: string; monto: number; texto: string };
export type DocumentoRpc = { tipo: "pago" | "venta_dia"; id: string } | { tipo: "rappi_lote"; importacion: string; lote: string };
export type Sugerencia = {
  tipo: TipoConciliacion; movimientos: string[]; documentos: DocumentoSugerido[]; concepto: Concepto;
  /** Movimientos − documentos (en cobro con tarjeta: depósito − venta con tarjeta); null sin documentos. */
  diferencia: number | null;
  /** Con documentos y diferencia 0: se puede confirmar en lote. */
  exacta: boolean;
  nota: string;
};

const c = (n: number) => Math.round(n * 100) / 100;
const dia = (f: string) => Date.parse(`${f}T00:00:00Z`) / 864e5;
const sumarDias = (f: string, n: number) => new Date((dia(f) + n) * 864e5).toISOString().slice(0, 10);

/** CLABE destino de un SPEI, en el formato del Excel ("SPEI. BANCO. CLABE.") o del PDF ("SPEI, BANCO, CLABE,"). */
export const clabeDestino = (descripcion: string) => descripcion.match(/SPEI[.,]\s*[^.,]+[.,]\s*(\d{18})[.,]/i)?.[1] ?? null;
const textoDe = (m: MovimientoBanco) => `${m.descripcion} ${m.referencia}`;
const esNetPay = (m: MovimientoBanco) => m.abono > 0 && /NET PAY/i.test(textoDe(m)) && !/DOMI:/i.test(textoDe(m));
const esComisionNetPay = (m: MovimientoBanco) => m.cargo > 0 && /DOMI:.*COM VTAS/i.test(textoDe(m));
const esRappi = (m: MovimientoBanco) => m.abono > 0 && /TECNOLO/i.test(textoDe(m));
const esNomina = (m: MovimientoBanco) => m.cargo > 0 && /SPEI/i.test(textoDe(m)) && /N[OÓ]MINA|\bQ\d{1,2}\b/i.test(textoDe(m));

export const conceptoDeCuenta = (cuenta: CuentaPl | null): Concepto =>
  cuenta === "renta" ? "renta" : cuenta === "servicios" ? "servicios"
    : cuenta === "marketing" || cuenta === "marketing_agregadores" ? "marketing" : cuenta === "inversiones" ? "capex" : "proveedores";

const REGLAS_TEXTO: readonly { patron: RegExp; lado: "cargo" | "abono" | "ambos"; concepto: Concepto; nota: string }[] = [
  { patron: /^\*?(IVA de )?Com\.|Comisi[oó]n Administraci[oó]n/i, lado: "cargo", concepto: "comisiones_bancarias", nota: "Comisión bancaria (regla de texto)." },
  { patron: /PAGO SUA|SIPARE/i, lado: "cargo", concepto: "imss_impuestos", nota: "Pago SUA/SIPARE (regla de texto)." },
  { patron: /Traspaso a cuenta/i, lado: "ambos", concepto: "traspaso_interno", nota: "Traspaso entre cuentas (regla de texto)." },
  { patron: /PRESTAMO/i, lado: "abono", concepto: "prestamo_recibido", nota: "Préstamo recibido (regla de texto)." },
];

export const documentosRpc = (docs: readonly DocumentoSugerido[]): DocumentoRpc[] =>
  docs.map((d) => (d.tipo === "rappi_lote" ? { tipo: d.tipo, importacion: d.importacionId, lote: d.lote } : { tipo: d.tipo, id: d.id }));

/** Sugerencias para movimientos aún no conciliados contra documentos aún no vinculados. Cada movimiento y documento aparece a lo más una vez. */
export function sugerirConciliaciones(movs: readonly MovimientoBanco[], docs: Documentos): Sugerencia[] {
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila);
  const usados = new Set<string>(), pagosUsados = new Set<string>(), ventasUsadas = new Set<string>(), lotesUsados = new Set<string>();
  const out: Sugerencia[] = [];
  const agregar = (s: Omit<Sugerencia, "exacta">) => {
    s.movimientos.forEach((id) => usados.add(id));
    out.push({ ...s, exacta: s.documentos.length > 0 && s.diferencia === 0 });
  };

  // 1. NetPay: el depósito (venta bruta) contra la venta con tarjeta de 1 a 4 días anteriores; comisión e IVA del día, en orden de fila.
  //    Cada día de venta se usa una sola vez; un día sin venta (cerrado) no rompe la ventana.
  for (const d of orden.filter(esNetPay)) {
    const comisiones = orden.filter((m) => m.fecha === d.fecha && esComisionNetPay(m) && !usados.has(m.id)).slice(0, 2);
    const candidatas = docs.ventas.filter((v) => !ventasUsadas.has(v.id) && v.tarjeta > 0 && v.fecha < d.fecha && dia(d.fecha) - dia(v.fecha) <= 4);
    let mejor: VentaTarjeta[] | null = null, diferencia = 0;
    for (let n = 1; n <= 4; n++) {
      const ventana = candidatas.filter((v) => v.fecha >= sumarDias(d.fecha, -n)).sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (!ventana.length) continue;
      const dif = c(d.abono - ventana.reduce((s, v) => s + v.tarjeta, 0));
      if (mejor === null || Math.abs(dif) < Math.abs(diferencia)) { mejor = ventana; diferencia = dif; }
    }
    if (!mejor) continue;
    mejor.forEach((v) => ventasUsadas.add(v.id));
    agregar({
      tipo: "cobro_tarjeta", movimientos: [d.id, ...comisiones.map((m) => m.id)], concepto: "cobranza_tarjeta", diferencia, nota: "",
      documentos: mejor.map((v) => ({ tipo: "venta_dia", id: v.id, monto: v.tarjeta, texto: `Venta con tarjeta del ${v.fecha}` })),
    });
  }

  // 2. Rappi: paidlot con el mismo neto; el depósito de validación (≤ $1) va sin documento.
  for (const m of orden.filter((x) => esRappi(x) && !usados.has(x.id))) {
    if (m.abono <= 1) {
      agregar({ tipo: "sin_documento", movimientos: [m.id], documentos: [], concepto: "otros_operacion", diferencia: null, nota: "Depósito de validación de cuenta de Rappi." });
      continue;
    }
    const l = docs.lotesRappi.find((x) => !lotesUsados.has(x.lote) && Math.abs(x.neto - m.abono) < 0.005);
    if (!l) continue;
    lotesUsados.add(l.lote);
    agregar({
      tipo: "cobro_rappi", movimientos: [m.id], concepto: "cobranza_rappi", diferencia: 0, nota: "",
      documentos: [{ tipo: "rappi_lote", importacionId: l.importacionId, lote: l.lote, monto: l.neto, texto: `Paidlot ${l.lote}` }],
    });
  }

  // 3. Nómina: un lote por día.
  const nominas = new Map<string, MovimientoBanco[]>();
  for (const m of orden) if (!usados.has(m.id) && esNomina(m)) nominas.set(m.fecha, [...(nominas.get(m.fecha) ?? []), m]);
  for (const [fecha, ms] of nominas)
    agregar({ tipo: "nomina", movimientos: ms.map((m) => m.id), documentos: [], concepto: "nomina", diferencia: null, nota: `Dispersión de nómina del ${fecha} (${ms.length} transferencias).` });

  // 4. Pagos a proveedores: misma CLABE, mismo monto, fecha ±5 días; el más cercano.
  for (const m of orden) {
    if (usados.has(m.id) || m.cargo <= 0) continue;
    const clabe = clabeDestino(m.descripcion);
    if (!clabe) continue;
    const distancia = (f: string) => Math.abs(dia(f) - dia(m.fecha));
    const p = docs.pagos.filter((x) => !pagosUsados.has(x.id) && x.clabe === clabe && Math.abs(x.monto - m.cargo) < 0.005 && distancia(x.fecha) <= 5)
      .sort((a, b) => distancia(a.fecha) - distancia(b.fecha))[0];
    if (!p) continue;
    pagosUsados.add(p.id);
    agregar({
      tipo: "pago_proveedor", movimientos: [m.id], concepto: conceptoDeCuenta(p.cuenta), diferencia: 0, nota: "",
      documentos: [{ tipo: "pago", id: p.id, monto: p.monto, texto: `Pago a ${p.proveedor} del ${p.fecha}` }],
    });
  }

  // 5. Reglas de texto, sin documento.
  for (const m of orden) {
    if (usados.has(m.id)) continue;
    const lado = m.cargo > 0 ? "cargo" : "abono";
    const r = REGLAS_TEXTO.find((x) => (x.lado === "ambos" || x.lado === lado) && x.patron.test(textoDe(m)));
    if (r) agregar({ tipo: "sin_documento", movimientos: [m.id], documentos: [], concepto: r.concepto, diferencia: null, nota: r.nota });
    else if (esComisionNetPay(m)) agregar({ tipo: "sin_documento", movimientos: [m.id], documentos: [], concepto: "comisiones_cobro", diferencia: null, nota: "Comisión NetPay sin depósito sugerido el mismo día." });
  }
  return out;
}
