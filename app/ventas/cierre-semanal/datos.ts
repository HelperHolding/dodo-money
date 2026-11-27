import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import { PREFIJO_EN_VIVO, esTurbo } from "@/lib/ventas/rappi";
import { esComisionNetPay, esNetPay, type MovimientoBanco } from "@/lib/banca/conciliacion";
import {
  armarCierreSemanal, atribuirNetPay, cambiosDesdeAprobacion, diasDeSemana,
  type ArqueoDia, type CierreSemanal, type MovBancoNetPay, type MovNetPay, type OrdenRappi, type VentaDodoDia,
} from "@/lib/ventas/cierreSemanal";

type Documento = NonNullable<MovBancoNetPay["documentos"]>[number];

export type AprobacionCierre = { id: string; nota: string | null; aprobadoPor: string; aprobadoEn: string; totales: CierreSemanal };
export type DatosCierreSemanal = {
  cierre: CierreSemanal; aprobacion: AprobacionCierre | null; cambios: string[];
  /** Abonos o comisiones NetPay de una cuenta compartida sin sucursal asignada: no se pueden atribuir y quedan fuera. */
  netpaySinAsignar: number;
  /** Cuentas de banco que se revisaron para NetPay. */
  cuentas: number;
};

const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const trozos = <T,>(xs: readonly T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Cualquier consulta que falle se detiene con un mensaje claro: nunca se muestra un cero en su lugar. */
const fallo = (que: string, detalle?: string): never => { throw new Error(`No se pudo consultar ${que} del cierre semanal${detalle ? `: ${detalle}` : ""}.`); };
async function leer<T>(que: string, pagina: Parameters<typeof leerTodo<T>>[0]): Promise<T[]> {
  try { return await leerTodo<T>(pagina); } catch (e) { return fallo(que, e instanceof Error ? e.message : String(e)); }
}

type FilaArqueo = {
  id: string; momento: ArqueoDia["momento"]; ventas_efectivo: number; diferencia: number; tarjeta_real: number | null; rappi_real: number | null;
  creado_en: string; anulado_en: string | null; turnos: { sucursal_id: string; fecha: string; tipo: ArqueoDia["turno"] };
};
type FilaMov = {
  id: string; fecha: string; fila_origen: number; descripcion: string; referencia: string | null; cargo: number; abono: number;
  sucursal_id: string | null; banca_importaciones: { sucursal_id: string | null } | null;
};

/**
 * Datos de una sucursal y una semana (lunes a domingo) para el cierre semanal (HD-5).
 *
 * NetPay: las cuentas son las de `banca_cuentas` cuya razón social (`rfc`) está ligada a la sucursal en
 * `razon_social_sucursales`; si la sucursal no tiene razón social propia, las de la razón social principal.
 * Un movimiento NetPay cuenta para la sucursal si:
 *  - está conciliado como `cobro_tarjeta` contra ventas de esta sucursal: cuenta su parte prorrateada por el monto de los
 *    documentos y va a la semana de la venta más reciente de esta sucursal (`atribuirNetPay`), o
 *  - no está conciliado y su sucursal (la del movimiento o la de su importación) es esta, o
 *  - no está conciliado, no tiene sucursal y la cuenta es de una razón social exclusiva de esta sucursal.
 * Los de una cuenta compartida sin sucursal no se pueden atribuir: se cuentan aparte en `netpaySinAsignar`.
 */
export async function cargarCierreSemanal(db: SupabaseClient, sucursal: string, lunes: string): Promise<DatosCierreSemanal> {
  const dias = diasDeSemana(lunes);
  const domingo = dias[6];
  // Sin conciliar cuentan del martes de la semana al lunes siguiente (lo filtra armarCierreSemanal). Los conciliados contra
  // ventas de esta semana pueden llegar después: se leen hasta tres semanas para encontrarlos por su conciliación.
  const desdeBanco = sumarDias(lunes, 1), hastaBanco = sumarDias(lunes, 21);

  const [arqueos, dodo, rappi, propias, principal, aprobada] = await Promise.all([
    leer<FilaArqueo>("los arqueos", (a, b) => db.from("arqueos")
      .select("id, momento, ventas_efectivo, diferencia, tarjeta_real, rappi_real, creado_en, anulado_en, turnos!inner(sucursal_id, fecha, tipo)")
      .eq("turnos.sucursal_id", sucursal).gte("turnos.fecha", lunes).lte("turnos.fecha", domingo)
      .order("id").range(a, b).returns<FilaArqueo[]>()),
    leer<VentaDodoDia>("las ventas de Dodo IS", (a, b) => db.from("ventas_dia").select("fecha, efectivo")
      .eq("sucursal_id", sucursal).gte("fecha", lunes).lte("fecha", domingo).order("fecha").range(a, b).returns<VentaDodoDia[]>()),
    // El portal de aliados es la fuente: órdenes del extractor (`portal-rappi-…`, igual que Ventas → Rappi) y finalizadas.
    // No se filtra `sumar`: en días que Dodo IS ya trae agregador llegan con sumar=false, pero siguen siendo la venta del portal.
    leer<{ fecha: string; tienda_id: string; subtotal_restaurante: number }>("las órdenes de Rappi", (a, b) => db.from("rappi_ordenes")
      .select("fecha, tienda_id, subtotal_restaurante").eq("sucursal_id", sucursal).eq("estado", "Finalizado").like("archivo", `${PREFIJO_EN_VIVO}%`)
      .gte("fecha", lunes).lte("fecha", domingo).order("rappi_id").range(a, b).returns<{ fecha: string; tienda_id: string; subtotal_restaurante: number }[]>()),
    db.from("razon_social_sucursales").select("rfc").eq("sucursal_id", sucursal).returns<{ rfc: string }[]>(),
    db.from("razones_sociales").select("rfc").eq("principal", true).maybeSingle<{ rfc: string }>(),
    db.from("cierres_semanales").select("id, totales, nota, aprobado_por, aprobado_en").eq("sucursal_id", sucursal).eq("semana", lunes)
      .maybeSingle<{ id: string; totales: CierreSemanal; nota: string | null; aprobado_por: string; aprobado_en: string }>(),
  ]);
  if (propias.error) fallo("la razón social de la sucursal", propias.error.message);
  if (principal.error) fallo("la razón social principal", principal.error.message);
  if (aprobada.error) fallo("la aprobación guardada", aprobada.error.message);

  // Cuentas de banco de la razón social de la sucursal y si esa razón social es solo de esta sucursal.
  const rfcs = (propias.data ?? []).map((r) => r.rfc);
  if (!rfcs.length && principal.data) rfcs.push(principal.data.rfc);
  const exclusivas = new Set<string>();
  if (rfcs.length) {
    const r = await db.from("razon_social_sucursales").select("rfc, sucursal_id").in("rfc", rfcs).returns<{ rfc: string; sucursal_id: string }[]>();
    if (r.error) fallo("las sucursales de la razón social", r.error.message);
    for (const rfc of rfcs) {
      const de = (r.data ?? []).filter((x) => x.rfc === rfc);
      if (rfc !== principal.data?.rfc && de.length === 1 && de[0].sucursal_id === sucursal) exclusivas.add(rfc);
    }
  }
  const cuentas = rfcs.length ? await db.from("banca_cuentas").select("id, rfc").in("rfc", rfcs).returns<{ id: string; rfc: string }[]>() : null;
  if (cuentas?.error) fallo("las cuentas de banco", cuentas.error.message);
  const ids = (cuentas?.data ?? []).map((c) => c.id);
  const exclusivaDe = new Map((cuentas?.data ?? []).map((c) => [c.id, exclusivas.has(c.rfc)]));

  let ultimoMovimiento: string | null = null;
  const netpay: MovNetPay[] = [];
  let netpaySinAsignar = 0;
  if (ids.length) {
    const [movs, ultimo] = await Promise.all([
      leer<FilaMov & { cuenta_id: string }>("los movimientos del banco", (a, b) => db.from("banca_movimientos")
        .select("id, cuenta_id, fecha, fila_origen, descripcion, referencia, cargo, abono, sucursal_id, banca_importaciones(sucursal_id)")
        .in("cuenta_id", ids).gte("fecha", desdeBanco).lte("fecha", hastaBanco).order("id").range(a, b).returns<(FilaMov & { cuenta_id: string })[]>()),
      db.from("banca_movimientos").select("fecha").in("cuenta_id", ids).order("fecha", { ascending: false }).limit(1).maybeSingle<{ fecha: string }>(),
    ]);
    if (ultimo.error) fallo("el último movimiento del banco", ultimo.error.message);
    ultimoMovimiento = ultimo.data?.fecha ?? null;

    const comoBanco = (m: FilaMov): MovimientoBanco => ({
      id: m.id, fecha: m.fecha, fila: m.fila_origen, descripcion: m.descripcion, referencia: m.referencia ?? "", cargo: Number(m.cargo), abono: Number(m.abono),
    });
    const deNetPay = movs.map((m) => ({ m, b: comoBanco(m) })).filter(({ b }) => esNetPay(b) || esComisionNetPay(b));

    // Conciliación de Banca: movimiento → conciliación cobro_tarjeta vigente → ventas_dia → semana de esas ventas.
    const conciliacionDe = new Map<string, string>();
    for (const t of trozos(deNetPay.map(({ m }) => m.id))) {
      const r = await db.from("banca_conciliacion_movimientos").select("movimiento_id, conciliacion_id, banca_conciliaciones!inner(tipo, anulada_en)")
        .eq("activa", true).eq("banca_conciliaciones.tipo", "cobro_tarjeta").is("banca_conciliaciones.anulada_en", null).in("movimiento_id", t)
        .returns<{ movimiento_id: string; conciliacion_id: string }[]>();
      if (r.error) fallo("las conciliaciones de Banca", r.error.message);
      for (const x of r.data ?? []) conciliacionDe.set(x.movimiento_id, x.conciliacion_id);
    }
    // Documentos de venta de cada conciliación, con su monto para prorratear entre sucursales (paginado: nunca se corta en 1000).
    const documentosDe = new Map<string, Documento[]>();
    for (const t of trozos([...new Set(conciliacionDe.values())])) {
      const filas = await leer<{ conciliacion_id: string; monto: number | null; ventas_dia: { fecha: string; sucursal_id: string } | null }>("los documentos conciliados",
        (a, b) => db.from("banca_conciliacion_documentos").select("id, conciliacion_id, monto, ventas_dia(fecha, sucursal_id)")
          .eq("activa", true).eq("tipo_documento", "venta_dia").in("conciliacion_id", t).order("id").range(a, b)
          .returns<{ conciliacion_id: string; monto: number | null; ventas_dia: { fecha: string; sucursal_id: string } | null }[]>());
      for (const x of filas) if (x.ventas_dia) {
        const doc = { sucursal: x.ventas_dia.sucursal_id, fecha: x.ventas_dia.fecha, monto: x.monto === null ? null : Number(x.monto) };
        documentosDe.set(x.conciliacion_id, [...(documentosDe.get(x.conciliacion_id) ?? []), doc]);
      }
    }

    const bancos = deNetPay.map(({ m, b }): MovBancoNetPay => {
      const tipo: MovNetPay["tipo"] = esNetPay(b) ? "deposito" : "comision";
      const conc = conciliacionDe.get(m.id);
      return {
        fecha: m.fecha, tipo, monto: tipo === "deposito" ? b.abono : b.cargo,
        sucursal: m.sucursal_id ?? m.banca_importaciones?.sucursal_id ?? null, exclusiva: !!exclusivaDe.get(m.cuenta_id),
        documentos: conc ? documentosDe.get(conc) ?? null : null,
      };
    });
    netpay.push(...atribuirNetPay(sucursal, bancos).netpay);
    // Sin asignar: solo lo que caería en la ventana de esta semana (martes a lunes siguiente).
    const finVentana = sumarDias(lunes, 7);
    netpaySinAsignar = atribuirNetPay(sucursal, bancos.filter((x) => x.fecha <= finVentana)).sinAsignar;
  }

  const arqueosDia: ArqueoDia[] = arqueos.map((a) => ({
    fecha: a.turnos.fecha, turno: a.turnos.tipo, momento: a.momento,
    ventas_efectivo: Number(a.ventas_efectivo), diferencia: Number(a.diferencia),
    tarjeta_real: a.tarjeta_real === null ? null : Number(a.tarjeta_real), rappi_real: a.rappi_real === null ? null : Number(a.rappi_real),
    creado_en: a.creado_en, anulado: !!a.anulado_en,
  }));
  const ordenes: OrdenRappi[] = rappi.map((o) => ({ fecha: o.fecha, turbo: esTurbo(o), subtotal: Number(o.subtotal_restaurante) }));
  const cierre = armarCierreSemanal(lunes, {
    arqueos: arqueosDia, rappi: ordenes, dodo: dodo.map((v) => ({ fecha: v.fecha, efectivo: Number(v.efectivo) })), netpay, ultimoMovimiento,
  });

  const fila = aprobada.data;
  const aprobacion: AprobacionCierre | null = fila
    ? { id: fila.id, nota: fila.nota, aprobadoPor: fila.aprobado_por, aprobadoEn: fila.aprobado_en, totales: fila.totales }
    : null;
  const cambios = aprobacion ? cambiosDesdeAprobacion(aprobacion.totales, cierre) : [];
  return { cierre, aprobacion, cambios, netpaySinAsignar: Math.round(netpaySinAsignar * 100) / 100, cuentas: ids.length };
}
