import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import { finDeMes } from "@/lib/finanzas/pl";
import { periodoMes } from "@/lib/finanzas/periodo";
import { calcularFlujo, flujoPorMes, visibles, type MovimientoFlujo, type SaldoPrevio } from "@/lib/finanzas/flujo";

type Fila = { id: string; cuenta_id: string; fecha: string; fila_origen: number; cargo: number; abono: number; saldo: number };
type Vinculo = { movimiento_id: string; banca_conciliaciones: { tipo: string; concepto: string } };
const falla = (que: string): never => { throw Error(`No se pudo consultar ${que} para el flujo de efectivo.`); };

/** Movimientos de las cuentas (de una razón social o todas) en el rango, con la conciliación activa de cada uno, y el saldo previo de cada cuenta. */
async function leerMovimientos(db: SupabaseClient, rfc: string | null, desde: string, hasta: string) {
  let q = db.from("banca_cuentas").select("id");
  if (rfc) q = q.eq("rfc", rfc);
  const cuentas = await q.returns<{ id: string }[]>();
  if (cuentas.error) falla("las cuentas bancarias");
  const ids = (cuentas.data ?? []).map((c) => c.id);
  if (!ids.length) return { movimientos: [] as MovimientoFlujo[], previos: [] as SaldoPrevio[], primeraFecha: null as string | null };
  const [movs, vinculos, primera, ...anteriores] = await Promise.all([
    leerTodo<Fila>((a, b) => db.from("banca_movimientos").select("id,cuenta_id,fecha,fila_origen,cargo,abono,saldo").in("cuenta_id", ids)
      .gte("fecha", desde).lte("fecha", hasta).order("fecha").order("fila_origen").order("id").range(a, b).returns<Fila[]>()),
    leerTodo<Vinculo>((a, b) => db.from("banca_conciliacion_movimientos")
      .select("movimiento_id,banca_conciliaciones!inner(tipo,concepto),banca_movimientos!inner(fecha,cuenta_id)").eq("activa", true)
      .in("banca_movimientos.cuenta_id", ids).gte("banca_movimientos.fecha", desde).lte("banca_movimientos.fecha", hasta)
      .order("conciliacion_id").order("movimiento_id").range(a, b).returns<Vinculo[]>()),
    db.from("banca_movimientos").select("fecha").in("cuenta_id", ids).order("fecha").limit(1).returns<{ fecha: string }[]>(),
    ...ids.map((id) => db.from("banca_movimientos").select("saldo").eq("cuenta_id", id).lt("fecha", desde)
      .order("fecha", { ascending: false }).order("fila_origen", { ascending: false }).limit(1).returns<{ saldo: number }[]>()),
  ]);
  if (primera.error || anteriores.some((r) => r.error)) falla("los saldos del banco");
  const conciliacion = new Map(vinculos.map((v) => [v.movimiento_id, v.banca_conciliaciones]));
  return {
    movimientos: movs.map((m): MovimientoFlujo => ({
      cuentaId: m.cuenta_id, fecha: m.fecha, fila: m.fila_origen, cargo: Number(m.cargo), abono: Number(m.abono), saldo: Number(m.saldo),
      conciliacion: conciliacion.get(m.id) ?? null,
    })),
    previos: ids.flatMap((id, i): SaldoPrevio[] => (anteriores[i].data?.[0] ? [{ cuentaId: id, saldo: Number(anteriores[i].data![0].saldo) }] : [])),
    primeraFecha: primera.data?.[0]?.fecha ?? null,
  };
}

const siguienteMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };

/** El mes elegido y el comparativo del año (desde enero o el primer mes con movimientos) con su total. */
export async function cargarFlujo(db: SupabaseClient, rfc: string | null, mes: string, hoy: string) {
  const anio = mes.slice(0, 4);
  const { movimientos, previos, primeraFecha } = await leerMovimientos(db, rfc, `${anio}-01-01`, finDeMes(mes));
  const primerMes = primeraFecha?.slice(0, 7) ?? null;
  const inicio = primerMes && primerMes > `${anio}-01` && primerMes <= mes ? primerMes : `${anio}-01`;
  const meses: string[] = [];
  for (let m = inicio; m <= mes; m = siguienteMes(m)) meses.push(m);
  const rangos = meses.map((m) => ({ etiqueta: periodoMes(m, hoy).titulo, desde: `${m}-01`, hasta: finDeMes(m) }));
  const flujos = flujoPorMes(movimientos, previos, rangos);
  const columnas = rangos.map((r, i) => ({ etiqueta: r.etiqueta, flujo: flujos[i] }));
  const total = { etiqueta: "Total", flujo: calcularFlujo(movimientos.filter((x) => x.fecha >= rangos[0].desde), previos) };
  const ultimo = rangos[rangos.length - 1];
  return {
    mes: { ...ultimo, flujo: flujos[flujos.length - 1] }, columnas, total,
    mostrarMes: visibles([flujos[flujos.length - 1]]), mostrarComparativo: visibles([...flujos, total.flujo]), primerMes,
  };
}
