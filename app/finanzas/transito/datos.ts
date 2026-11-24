import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import { aplicarConciliaciones } from "@/lib/ventas/conciliacion";
import { leerConciliaciones } from "@/app/ventas/conciliacion/datos";
import { fechaMX } from "@/lib/formato";
import { cuentaPuente, documentosEnTransito, lotesLiquidados, type CuentaPuente, type Partida } from "@/lib/finanzas/transito";
import type { MovimientoRappi } from "@/lib/banca/rappi";

/** Desde aquí está importado el banco: lo anterior no se cuenta. */
export const DESDE = "2026-10-01";
/** Días normales en tránsito antes de marcarlo atrasado. */
export const DIAS_NORMALES = { tarjeta: 4, rappi: 10, recoleccion: 7, deposito: 7 } as const;

export type Filtro = { sucursal: string; empresa: string };
export type Cuentas = { tarjeta: CuentaPuente; rappi: CuentaPuente; recoleccion: CuentaPuente; deposito: CuentaPuente };

type MovBanca = {
  movimiento_id: string;
  banca_conciliaciones: { concepto: string; anulada_en: string | null; banca_cuentas: { rfc: string } | null } | null;
  banca_movimientos: { fecha: string; cargo: number; abono: number; descripcion: string; sucursal_id: string | null; banca_importaciones: { sucursal_id: string | null } | null } | null;
};

export async function leerTransito(supabase: SupabaseClient, filtro: Filtro, hoy: string): Promise<Cuentas> {
  const [dias, desglose, conciliaciones, banca, rappi, recolecciones, razones] = await Promise.all([
    leerTodo<{ id: string; importacion_id: string; sucursal_id: string; fecha: string; total: number; efectivo: number; tarjeta: number; en_linea: number }>((d, h) =>
      supabase.from("ventas_dia").select("id, importacion_id, sucursal_id, fecha, total, efectivo, tarjeta, en_linea").gte("fecha", DESDE).lte("fecha", hoy).order("id").range(d, h)),
    leerTodo<{ ventas_dia_id: string; tarjeta: number }>((d, h) => supabase.from("ventas_dia_desglose").select("ventas_dia_id, tarjeta, ventas_dia!inner(fecha)")
      .eq("tipo", "agregador").gte("ventas_dia.fecha", DESDE).order("ventas_dia_id").range(d, h).returns<{ ventas_dia_id: string; tarjeta: number }[]>()),
    leerConciliaciones(supabase, DESDE, hoy),
    leerTodo<MovBanca>((d, h) => supabase.from("banca_conciliacion_movimientos")
      .select("movimiento_id, banca_conciliaciones!inner(concepto, anulada_en, banca_cuentas(rfc)), banca_movimientos!inner(fecha, cargo, abono, descripcion, sucursal_id, banca_importaciones(sucursal_id))")
      .eq("activa", true).is("banca_conciliaciones.anulada_en", null)
      .in("banca_conciliaciones.concepto", ["cobranza_tarjeta", "comisiones_cobro", "cobranza_rappi", "deposito_efectivo"])
      .gte("banca_movimientos.fecha", DESDE).order("movimiento_id").range(d, h).returns<MovBanca[]>()),
    leerTodo<{ id: string; sucursal_id: string; rfc: string; reporte: { movimientos: MovimientoRappi[] } }>((d, h) =>
      supabase.from("rappi_fin_importaciones").select("id, sucursal_id, rfc, reporte").is("sustituida_en", null).gte("hasta", DESDE).order("id").range(d, h).returns<{ id: string; sucursal_id: string; rfc: string; reporte: { movimientos: MovimientoRappi[] } }[]>()),
    leerTodo<{ id: string; sucursal_id: string; desde: string; hasta: string; creado_en: string; contado_corporativo: number | null; recibido_en: string | null }>((d, h) =>
      supabase.from("recolecciones_corporativo").select("id, sucursal_id, desde, hasta, creado_en, contado_corporativo, recibido_en").gte("creado_en", `${DESDE}T06:00:00Z`).order("id").range(d, h)),
    supabase.from("razon_social_sucursales").select("rfc, sucursal_id").returns<{ rfc: string; sucursal_id: string }[]>(),
  ]);
  const sucursalesDe = new Map<string, Set<string>>();
  for (const r of razones.data ?? []) sucursalesDe.set(r.rfc, (sucursalesDe.get(r.rfc) ?? new Set()).add(r.sucursal_id));
  // Una partida entra si es de la sucursal elegida y, con razón social, de una sucursal de esa razón social (o de su cuenta).
  const deSucursal = (s: string | null) => (!filtro.sucursal || s === filtro.sucursal) && (!filtro.empresa || (!!s && !!sucursalesDe.get(filtro.empresa)?.has(s)));
  const deCuenta = (s: string | null, rfc: string | null | undefined) => (!filtro.sucursal || s === filtro.sucursal) && (!filtro.empresa || rfc === filtro.empresa);

  // Tarjeta → banco: lo cobrado con tarjeta (ventas conciliadas contra NetPay, sin la parte de agregador).
  const agregador = new Map(desglose.map((x) => [x.ventas_dia_id, Number(x.tarjeta)]));
  const conciliados = aplicarConciliaciones(dias, conciliaciones.filas);
  const ventasTarjeta: Partida[] = conciliados.filter((d) => deSucursal(d.sucursal_id))
    .map((d) => ({ fecha: d.fecha, monto: Math.round((Number(d.tarjeta) - (agregador.get(d.id) ?? 0)) * 100) / 100, texto: "Venta con tarjeta", href: `/ventas/conciliacion?mes=${d.fecha.slice(0, 7)}&sucursal=${d.sucursal_id}` }));
  const banco = (conceptos: string[], campo: "abono" | "cargo") => banca
    .filter((m) => m.banca_conciliaciones && m.banca_movimientos && conceptos.includes(m.banca_conciliaciones.concepto)
      && deCuenta(m.banca_movimientos.sucursal_id ?? m.banca_movimientos.banca_importaciones?.sucursal_id ?? null, m.banca_conciliaciones.banca_cuentas?.rfc))
    .map((m) => ({ fecha: m.banca_movimientos!.fecha, monto: Number(m.banca_movimientos![campo]), texto: m.banca_movimientos!.descripcion }))
    .filter((p) => p.monto > 0);
  // Las comisiones NetPay también cierran la venta: lo cobrado = depósito + comisión.
  const tarjeta = cuentaPuente(ventasTarjeta, [...banco(["cobranza_tarjeta"], "abono"), ...banco(["comisiones_cobro"], "cargo")], hoy, DIAS_NORMALES.tarjeta);

  // Rappi → banco: neto de cada paidlot liquidado contra depósitos conciliados como cobranza Rappi.
  const lotes: Partida[] = rappi.filter((r) => deCuenta(r.sucursal_id, r.rfc))
    .flatMap((r) => lotesLiquidados(r.reporte?.movimientos ?? []).map((l) => ({ fecha: l.fecha, monto: l.neto, texto: `Paidlot ${l.lote}`, href: "/banca?vista=rappi" })))
    .filter((l) => l.fecha >= DESDE);
  const rappiCuenta = cuentaPuente(lotes, banco(["cobranza_rappi"], "abono"), hoy, DIAS_NORMALES.rappi);

  // Bóveda → corporativo: cada recolección (no rechazada) hasta que corporativo la recibe.
  const ids = recolecciones.map((r) => r.id);
  const movimientos: { id: string; monto: number; estado: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("movimientos").select("id, monto, estado").in("id", ids.slice(i, i + 200)).returns<{ id: string; monto: number; estado: string }[]>();
    movimientos.push(...(data ?? []));
  }
  const mov = new Map(movimientos.map((m) => [m.id, m]));
  const validas = recolecciones.filter((r) => mov.get(r.id) && mov.get(r.id)!.estado !== "rechazado" && deSucursal(r.sucursal_id));
  const recoleccion = documentosEnTransito(
    validas.map((r) => ({ clave: r.id, fecha: fechaMX(r.creado_en), monto: Number(mov.get(r.id)!.monto), texto: `Recolección ${r.desde === r.hasta ? r.desde : `${r.desde} a ${r.hasta}`}`, href: "/efectivo" })),
    new Set(validas.filter((r) => r.recibido_en).map((r) => r.id)), hoy, DIAS_NORMALES.recoleccion);

  // Corporativo → banco: lo recibido en corporativo contra depósitos de efectivo conciliados.
  const recibido: Partida[] = validas.filter((r) => r.recibido_en)
    .map((r) => ({ fecha: fechaMX(r.recibido_en!), monto: Number(r.contado_corporativo ?? mov.get(r.id)!.monto), texto: `Recibido en corporativo (${r.desde === r.hasta ? r.desde : `${r.desde} a ${r.hasta}`})`, href: "/efectivo" }));
  const deposito = cuentaPuente(recibido, banco(["deposito_efectivo"], "abono"), hoy, DIAS_NORMALES.deposito);

  return { tarjeta, rappi: rappiCuenta, recoleccion, deposito };
}
