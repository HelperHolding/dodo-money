import { createHash } from "node:crypto";
import type { Hoja } from "../ventas/xlsx";

export type MovimientoBanregio = {
  fila: number; fecha: string; descripcion: string; referencia: string; clasificacion: string;
  cargo: number; abono: number; saldo: number; huella: string; original: (string | number | null)[];
};
export type ReporteBanregio = {
  cuenta: string; clabe: string; rfc: string; titular: string; desde: string; hasta: string;
  primeraFecha: string; ultimaFecha: string; saldoInicial: number; saldoFinal: number;
  cargos: number; abonos: number; movimientos: MovimientoBanregio[]; avisos: string[];
};
const texto = (v: unknown) => String(v ?? "").trim();
const clave = (v: unknown) => texto(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const separador = "\u001f";

/** Centavos enteros: nunca redondea silenciosamente una entrada del banco. */
export function centavosBanregio(v: unknown, vacio = false): number {
  if (vacio && texto(v) === "") return 0;
  const t = texto(v).replace(/^\$\s*/, "");
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(t)) throw Error(`Importe inválido: ${texto(v).slice(0, 40)}.`);
  const [entero, dec = ""] = t.replaceAll(",", "").replace(/^-/, "").split(".");
  const n = (Number(entero) * 100 + Number(dec.padEnd(2, "0"))) * (t.startsWith("-") ? -1 : 1);
  if (!Number.isSafeInteger(n) || Math.abs(n) >= 1e14) throw Error("Importe fuera de rango.");
  return n;
}
function fecha(v: unknown): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(v));
  if (!m) throw Error("Se esperaba una fecha dd/mm/aaaa de Banregio.");
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw Error("Fecha bancaria inválida.");
  return iso;
}
export function huellaBanregio(m: Pick<MovimientoBanregio, "fecha" | "descripcion" | "referencia" | "cargo" | "abono" | "saldo">): string {
  return sha([m.fecha, m.descripcion, m.referencia, m.cargo.toFixed(2), m.abono.toFixed(2), m.saldo.toFixed(2)].join(separador));
}

export function leerBanregio(libro: Hoja[]): ReporteBanregio {
  const hojas = libro.filter(h => !h.oculta);
  if (hojas.length !== 1) throw Error("Usa el reporte de movimientos de Banregio con una sola hoja visible.");
  return leerHojaBanregio(hojas[0]);
}

export function leerHojaBanregio(hoja: Hoja): ReporteBanregio {
  if (hoja.formulas?.size) throw Error("El reporte debe conservar los valores originales de Banregio, sin fórmulas.");
  const celda = (col: string, fila: number) => hoja.celdas.get(`${col}${fila}`);
  const todos = [...hoja.celdas.values()].map(texto);
  const unico = (patron: RegExp) => {
    const encontrados = todos.map(t => patron.exec(t)?.[1]).filter((v): v is string => v !== undefined);
    if (encontrados.length !== 1) throw Error("No se pudo identificar la cuenta, RFC o periodo del reporte Banregio.");
    return encontrados[0].trim();
  };
  const cuenta = unico(/^CUENTA:\s*(\d{12})$/i);
  const clabe = unico(/^CLABE:\s*(\d{18})$/i);
  const rfc = unico(/^RFC:\s*([A-ZÑ&]{3,4}\d{6}[A-Z\d]{3})\s*$/i).toUpperCase();
  const digitos = [...clabe].map(Number);
  if (!clabe.startsWith("058") || (10 - digitos.slice(0, 17).reduce((s, d, i) => s + d * [3, 7, 1][i % 3] % 10, 0) % 10) % 10 !== digitos[17]) throw Error("La CLABE de Banregio no es válida.");
  const desde = fecha(unico(/^Fecha inicio:\s*(.*)$/i));
  const hasta = fecha(unico(/^Fecha fin:\s*(.*)$/i));
  if (desde > hasta) throw Error("El periodo del reporte está invertido.");
  const encabezados = [...hoja.celdas.entries()].filter(([ref, v]) => /^A\d+$/.test(ref) && clave(v) === "fecha");
  if (encabezados.length !== 1) throw Error("No se encontró el encabezado de movimientos.");
  const encabezado = Number(encabezados[0][0].slice(1));
  if (!/^descripci/.test(clave(celda("B", encabezado))) || clave(celda("C", encabezado)) !== "referencia" || !/^cargos?$/.test(clave(celda("D", encabezado))) || !/^abonos?$/.test(clave(celda("E", encabezado))) || clave(celda("F", encabezado)) !== "saldo" || !/^clasificaci/.test(clave(celda("G", encabezado)))) throw Error("Las columnas no corresponden al reporte de movimientos de Banregio.");
  const rfcRef = [...hoja.celdas.entries()].find(([, v]) => /^RFC:/i.test(texto(v)))![0];
  const titular = texto(celda("B", Number(rfcRef.slice(1)) - 1));
  if (!titular || titular.length > 300) throw Error("No se pudo identificar al titular del reporte.");
  const inicialFila = encabezado + 1;
  if (clave(celda("B", inicialFila)) !== "saldo inicial") throw Error("Falta el saldo inicial del reporte.");
  const saldoInicialCentavos = centavosBanregio(celda("F", inicialFila));
  let saldo = saldoInicialCentavos, cargos = 0, abonos = 0;
  const fin = Math.max(...[...hoja.celdas.keys()].map(k => Number(/\d+$/.exec(k)?.[0] ?? 0)));
  if (fin - inicialFila > 2000) throw Error("El reporte puede contener hasta 2,000 movimientos.");
  const movimientos: MovimientoBanregio[] = [];
  const huellas = new Set<string>();
  for (let f = inicialFila + 1; f <= fin; f++) {
    const original = ["A", "B", "C", "D", "E", "F", "G"].map(c => celda(c, f) ?? null);
    if (original.every(v => texto(v) === "")) continue;
    try {
      const dia = fecha(original[0]);
      if (dia < desde || dia > hasta || (movimientos.length && dia < movimientos[movimientos.length - 1].fecha)) throw Error("Fecha fuera del periodo o movimientos fuera de orden.");
      const cargo = centavosBanregio(original[3], true), abono = centavosBanregio(original[4], true), nuevoSaldo = centavosBanregio(original[5]);
      if (cargo < 0 || abono < 0 || (cargo > 0) === (abono > 0)) throw Error("Debe existir un cargo o un abono positivo, no ambos.");
      if (saldo - cargo + abono !== nuevoSaldo) throw Error("El saldo no coincide con el movimiento anterior.");
      const descripcion = texto(original[1]), referencia = texto(original[2]), clasificacion = texto(original[6]);
      if (!descripcion || descripcion.length > 2000 || referencia.length > 500 || clasificacion.length > 300 || [descripcion, referencia, clasificacion].some(t => /[\u0000-\u001f]/.test(t))) throw Error("Descripción, referencia o clasificación inválida.");
      const m = { fila: f, fecha: dia, descripcion, referencia, clasificacion, cargo: cargo / 100, abono: abono / 100, saldo: nuevoSaldo / 100, original };
      const huella = huellaBanregio(m);
      if (huellas.has(huella)) throw Error("Hay dos movimientos idénticos y no se pueden distinguir. Revisa el reporte.");
      huellas.add(huella); movimientos.push({ ...m, huella }); saldo = nuevoSaldo; cargos += cargo; abonos += abono;
      if (!Number.isSafeInteger(cargos) || !Number.isSafeInteger(abonos)) throw Error("Los totales exceden la precisión admitida.");
    } catch (e) { throw Error(`Fila ${f}: ${e instanceof Error ? e.message : "Movimiento inválido."}`); }
  }
  if (!movimientos.length) throw Error("El reporte no contiene movimientos.");
  const avisos: string[] = [];
  if (movimientos[movimientos.length - 1].fecha < hasta) avisos.push("El periodo solicitado termina después del último movimiento. No se confirma cobertura completa ni saldo actual.");
  if (todos.some(t => t.includes("\ufffd"))) avisos.push("El archivo trae caracteres dañados en algunos textos. Se conservan como los entrega Banregio.");
  return { cuenta, clabe, rfc, titular, desde, hasta, primeraFecha: movimientos[0].fecha, ultimaFecha: movimientos[movimientos.length - 1].fecha, saldoInicial: saldoInicialCentavos / 100, saldoFinal: saldo / 100, cargos: cargos / 100, abonos: abonos / 100, movimientos, avisos };
}
