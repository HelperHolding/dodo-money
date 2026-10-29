/** P&L con la estructura de la plantilla de los asesores: reacomoda lo que calcula `calcularPL`, sin cálculos nuevos. */
import type { ClaveRenglon, EntradaPL, FilaPL } from "./pl";

export type SeccionAsesores = "ventas" | "cogs" | "sucursal" | "corporativo" | "bajo";
export type RenglonAsesores = {
  clave: string; nombre: string; seccion: SeccionAsesores; tipo: "renglon" | "total";
  /** null: sin dato (se muestra "Pendiente"). */
  monto: number | null;
  pct: number | null;
  /** Falta información: sin monto, o monto parcial. */
  pendiente: boolean;
  /** Claves de detalle del P&L ("De dónde sale") que corresponden a este renglón. */
  origen: readonly string[];
};
export type FormatoAsesores = { renglones: RenglonAsesores[]; base: "bruta" | "neta"; avisos: string[] };

export const SECCIONES_ASESORES: readonly { clave: SeccionAsesores; nombre: string; fondo: string; css: string }[] = [
  { clave: "ventas", nombre: "Ventas", fondo: "BDD7EE", css: "pl-venta" },
  { clave: "cogs", nombre: "COGS", fondo: "D9EAD3", css: "pl-costo" },
  { clave: "sucursal", nombre: "Gastos sucursal", fondo: "FCE4D6", css: "pl-operacion" },
  { clave: "corporativo", nombre: "Corporativo", fondo: "EAD1DC", css: "pl-oficina" },
  { clave: "bajo", nombre: "Debajo de EBITDA", fondo: "F2F2F2", css: "pl-memo" },
];

const c = (n: number) => Math.round(n * 100) / 100;

export function formatoAsesores(e: EntradaPL, filas: readonly FilaPL[]): FormatoAsesores {
  const m = (k: ClaveRenglon) => filas.find((f) => f.clave === k)?.monto ?? 0;
  const { dodo, rappi } = e.canales;
  /** Venta bruta sin IVA: la `bruta` del canal lleva IVA y no se compara con la neta. */
  const brutas = dodo.brutaSinIva === null || rappi.brutaSinIva === null ? null : c(dodo.brutaSinIva + rappi.brutaSinIva);
  const descuento = (x: typeof dodo) => (x.brutaSinIva === null ? null : c(x.brutaSinIva - x.neta));
  const descDodo = descuento(dodo), descRappi = descuento(rappi);
  const totalDesc = descDodo === null || descRappi === null ? null : c(descDodo + descRappi);
  const netas = c(e.ventaNeta + (e.rappiFueraBase ?? 0) + (e.rappiExcedente ?? 0));
  const merma = e.merma;
  const utilidadBruta = c(netas - e.agregadores - e.alimento - (merma ?? 0));
  /** Merma o Rappi pendientes: los totales llevan monto, pero provisional. */
  const provisional = e.mermaPendiente || Boolean(e.rappiPendiente);

  type Sin = Omit<RenglonAsesores, "pct" | "seccion">;
  const r = (clave: string, nombre: string, monto: number | null, origen: readonly string[] = [], extra: Partial<Sin> = {}): Sin =>
    ({ clave, nombre, tipo: "renglon", monto, pendiente: monto === null, origen, ...extra });
  const total = (clave: string, nombre: string, monto: number | null, pendiente = false): Sin =>
    ({ ...r(clave, nombre, monto), tipo: "total", pendiente: monto === null || pendiente });
  /** Renglón que la plantilla no tiene: solo si trae monto. */
  const opcional = (x: Sin) => (x.monto ? [x] : []);

  const sucursal: Sin[] = [
    r("nomina", "Nómina sucursal", c(m("nomina_cocina") + m("nomina_gerencia")), ["nomina_cocina", "nomina_gerencia"]),
    r("regalias", "Regalías", m("regalias"), ["regalias"]),
    r("mantenimiento", "Gastos de mantenimiento", m("mantenimiento"), ["mantenimiento"]),
    r("renta", "Renta", m("renta"), ["renta"]),
    r("servicios", "Servicios (luz, agua, basura, etc.)", m("servicios"), ["servicios"]),
    r("marketing_rappi", "Marketing Rappi", m("marketing_agregadores"), ["marketing_agregadores"]),
    ...opcional(r("repartidores", "Repartidores", m("repartidores"), ["repartidores"])),
    ...opcional(r("rappi_ajustes", "Rappi · compensaciones y cancelaciones", m("rappi_ajustes"), ["rappi_ajustes"])),
    ...opcional(r("marketing", "Marketing", m("marketing"), ["marketing"])),
    ...opcional(r("consumibles_equipo", "Consumibles y equipo menor", m("consumibles_equipo"), ["consumibles_equipo"])),
    ...opcional(r("comisiones_cobro", "Comisiones de cobro (NetPay y dLocal)", e.comisionesCobro, ["comisiones_cobro"])),
    ...opcional(r("otros", "Otros gastos de operación", c(m("otros") - e.comisionesCobro), ["otros"])),
  ];
  const totalSucursal = c(sucursal.reduce((s, x) => s + (x.monto ?? 0), 0));
  const ebitda4 = c(utilidadBruta - totalSucursal);
  const ebitda = c(ebitda4 - m("oficina"));
  for (const [nombre, propio, pl] of [["EBITDA 4-Wall", ebitda4, m("ebitda_tienda")], ["EBITDA", ebitda, m("ebitda")]] as const)
    if (Math.abs(propio - pl) > 0.005) throw new Error(`El formato de asesores no cuadra con el P&L: ${nombre} ${propio} contra ${pl}.`);

  const secciones: [SeccionAsesores, Sin[]][] = [
    ["ventas", [
      r("ventas_dinein", "Ventas Dine-In", dodo.brutaSinIva),
      r("ventas_rappi", "Ventas brutas Rappi", rappi.brutaSinIva),
      total("ventas_brutas", "Ventas brutas", brutas),
      r("descuentos_dinein", "Descuentos Dine-In", descDodo),
      r("descuentos_rappi", "Descuentos Rappi", descRappi),
      total("total_descuentos", "Total descuentos", totalDesc),
      ...opcional(r("rappi_fuera_base", "Rappi · ingresos fuera de base de retención", e.rappiFueraBase ?? 0, ["rappi_fuera_base"])),
      ...opcional(r("rappi_excedente", "Rappi · excedente DAR sin IVA", e.rappiExcedente ?? 0, ["rappi_excedente"])),
      total("ventas_netas", "Ventas netas", netas, Boolean(e.rappiPendiente)),
      r("comision_rappi", "Comisión Rappi", e.agregadores, ["agregadores"], { pendiente: Boolean(e.rappiPendiente) }),
    ]],
    ["cogs", [
      r("alimento", "Alimentos y empaque", e.alimento, ["alimento"]),
      r("merma", "Merma", merma === null && !e.mermaPendiente ? 0 : merma, ["merma"], { pendiente: e.mermaPendiente }),
      total("utilidad_bruta", "Utilidad bruta", utilidadBruta, provisional),
    ]],
    ["sucursal", [...sucursal, total("total_sucursal", "Total gastos sucursal", totalSucursal, provisional), total("ebitda_4wall", "EBITDA 4-Wall", ebitda4, provisional)]],
    ["corporativo", [r("corporativo", "Gasto corporativo", m("oficina"), ["oficina"]), total("ebitda", "EBITDA", ebitda, provisional)]],
    ["bajo", [
      r("dya", "Depreciación y amortización", null), total("ebit", "EBIT", null),
      r("intereses", "Intereses", null), total("uai", "Utilidad antes de impuestos", null),
      r("isr", "ISR", null), total("utilidad_neta", "Utilidad neta", null),
    ]],
  ];

  const baseBruta = brutas !== null;
  const base = baseBruta ? brutas : netas;
  const pct = (n: number | null) => (n === null || !base ? null : n / base);
  return {
    renglones: secciones.flatMap(([seccion, xs]) => xs.map((x) => ({ ...x, seccion, pct: pct(x.monto) }))),
    base: baseBruta ? "bruta" : "neta",
    avisos: baseBruta ? [] : ["La venta bruta sin IVA no está completa (falta detalle por producto de algún día, o Rappi usa el reporte financiero); los porcentajes se calculan sobre ventas netas."],
  };
}
