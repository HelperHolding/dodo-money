/** Gasto sin CFDI (prefactura, recibo): renglones con su cuenta del P&L, IVA y retenciones. */
export type Impuestos = { iva: 0 | 0.16; retIva: "ninguna" | "dos_tercios"; retIsr: "ninguna" | "diez" };
export const IMPUESTOS_ARRENDAMIENTO: Impuestos = { iva: 0.16, retIva: "dos_tercios", retIsr: "diez" };

export type GastoManual = {
  proveedor_id: string; sucursal_id: string | null; fecha: string; vence_el: string | null; folio: string;
  renglones: { descripcion: string; importe: number; cuenta_pl: string | null }[];
  subtotal: number; iva: number; retencion_iva: number; retencion_isr: number; total: number;
};

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Subtotal, IVA, retenciones (2/3 del IVA; 10 % de ISR) y total = subtotal + IVA − retenciones. */
export function calcularGasto(renglones: readonly { importe: number }[], imp: Impuestos) {
  const subtotal = centavos(renglones.reduce((t, r) => t + (Number(r.importe) || 0), 0));
  const iva = centavos(subtotal * imp.iva);
  const retencion_iva = imp.retIva === "dos_tercios" ? centavos((iva * 2) / 3) : 0;
  const retencion_isr = imp.retIsr === "diez" ? centavos(subtotal * 0.1) : 0;
  const retenciones = centavos(retencion_iva + retencion_isr);
  return { subtotal, iva, retencion_iva, retencion_isr, retenciones, total: centavos(subtotal + iva - retenciones) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const numero = (t: string) => Number(t.replace(/[$,\s]/g, ""));

/** Lee el formulario "Agregar sin CFDI". `lista(c)` da los valores repetidos de cada renglón; `cuentas` son las cuentas válidas del P&L. */
export function leerGastoManual(valor: (c: string) => string, lista: (c: string) => string[], cuentas: readonly string[], hoy: string):
  { datos: GastoManual } | { error: string } {
  const proveedor_id = valor("proveedor_id").trim();
  if (!UUID.test(proveedor_id)) return { error: "Elige el proveedor." };
  const folio = valor("folio").trim();
  if (!folio) return { error: "Escribe la referencia (folio de la prefactura o del recibo)." };
  const fecha = valor("fecha").trim();
  if (!FECHA.test(fecha)) return { error: "Elige la fecha." };
  if (fecha > hoy) return { error: "La fecha no puede ser futura." };
  const vence = valor("vence_el").trim();
  if (vence && !FECHA.test(vence)) return { error: "Revisa el vencimiento." };
  if (vence && vence < fecha) return { error: "El vencimiento no puede ser antes de la fecha." };
  const suc = valor("sucursal_id").trim();
  if (suc !== "oficina" && !UUID.test(suc)) return { error: "Elige la sucursal (u Oficina)." };

  const descripciones = lista("renglon_descripcion"), importes = lista("renglon_importe"), cuentasRenglon = lista("renglon_cuenta");
  const renglones: GastoManual["renglones"] = [];
  for (let i = 0; i < descripciones.length; i++) {
    const descripcion = (descripciones[i] ?? "").trim(), texto = (importes[i] ?? "").trim(), cuenta = (cuentasRenglon[i] ?? "").trim();
    if (!descripcion && !texto) continue;
    const n = renglones.length + 1;
    if (!descripcion) return { error: `Renglón ${n}: escribe la descripción.` };
    const importe = numero(texto);
    if (!texto || !Number.isFinite(importe) || importe <= 0) return { error: `Renglón ${n}: escribe un importe mayor a cero.` };
    if (cuenta && !cuentas.includes(cuenta)) return { error: `Renglón ${n}: elige una cuenta del P&L de la lista.` };
    renglones.push({ descripcion, importe: centavos(importe), cuenta_pl: cuenta || null });
  }
  if (!renglones.length) return { error: "Agrega al menos un renglón con descripción e importe." };

  const iva = valor("iva") === "0" ? 0 : 0.16;
  const retIva = valor("ret_iva") === "dos_tercios" ? "dos_tercios" : "ninguna";
  const retIsr = valor("ret_isr") === "diez" ? "diez" : "ninguna";
  if (retIva === "dos_tercios" && iva === 0) return { error: "La retención de IVA necesita IVA del 16 %." };
  const t = calcularGasto(renglones, { iva, retIva, retIsr });
  return {
    datos: {
      proveedor_id, sucursal_id: suc === "oficina" ? null : suc, fecha, vence_el: vence || null, folio, renglones,
      subtotal: t.subtotal, iva: t.iva, retencion_iva: t.retencion_iva, retencion_isr: t.retencion_isr, total: t.total,
    },
  };
}
