// Cálculo puro del cierre semanal de ventas por sucursal (HD-5). Sin React ni Supabase.
// @ts-expect-error Node strip-types requiere extensión explícita.
import { pesos } from "../formato.ts";

export type ArqueoDia = {
  fecha: string; turno: "matutino" | "vespertino"; momento: "inicio" | "traspaso" | "cierre";
  ventas_efectivo: number; diferencia: number; tarjeta_real: number | null; rappi_real: number | null;
};
export type OrdenRappi = { fecha: string; turbo: boolean; subtotal: number };
export type VentaDodoDia = { fecha: string; efectivo: number };
export type MovNetPay = { fecha: string; tipo: "deposito" | "comision"; monto: number; conciliadoSemana: string | null };

export type DiaCierre = {
  fecha: string; efectivo: number; tarjeta: number; rappi: number; turbo: number; total: number;
  sinArqueos: boolean; sinPortal: boolean; difEfectivo: number | null; difRappi: number | null;
};
export type CierreSemanal = {
  dias: DiaCierre[];
  semana: { efectivo: number; tarjeta: number; rappi: number; turbo: number; total: number; difEfectivo: number; difRappi: number };
  netpay: { tarjeta: number; depositado: number; comisiones: number; diferencia: number | null; pendiente: boolean; ultimoMovimiento: string | null };
};

const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const suma = (xs: number[]) => centavos(xs.reduce((s, x) => s + x, 0));

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes (AAAA-MM-DD) de la semana de una fecha. */
export function semanaDe(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((d + 6) % 7));
}

export const diasDeSemana = (lunes: string): string[] => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));

const hoyMexico = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

/**
 * `ventas_efectivo` de cada arqueo es la venta de ESE turno (el formulario dice «Ventas en efectivo del turno» y
 * el cuadre es fondo del turno + ventas − retiros), así que los dos turnos se suman sin restar nada.
 * `tarjeta_real` y `rappi_real` se capturan en el mismo arqueo y se toman igual, por turno.
 */
function arqueoDeVenta(arqueos: ArqueoDia[], turno: ArqueoDia["turno"]): ArqueoDia | undefined {
  const orden: ArqueoDia["momento"][] = turno === "matutino" ? ["traspaso", "cierre"] : ["cierre"];
  for (const m of orden) {
    const a = arqueos.find((x) => x.turno === turno && x.momento === m);
    if (a) return a;
  }
  return undefined;
}

export function armarCierreSemanal(
  lunes: string,
  d: { arqueos: ArqueoDia[]; rappi: OrdenRappi[]; dodo: VentaDodoDia[]; netpay: MovNetPay[]; ultimoMovimiento: string | null; hoy?: string },
): CierreSemanal {
  const hoy = d.hoy ?? hoyMexico();
  const dias: DiaCierre[] = diasDeSemana(lunes).map((fecha) => {
    const delDia = d.arqueos.filter((a) => a.fecha === fecha);
    const usados = (["matutino", "vespertino"] as const).map((t) => arqueoDeVenta(delDia, t)).filter((a): a is ArqueoDia => !!a);
    const sinArqueos = usados.length === 0;
    const efectivo = sinArqueos ? 0 : suma(usados.map((a) => Number(a.ventas_efectivo) + Number(a.diferencia)));
    const tarjeta = sinArqueos ? 0 : suma(usados.map((a) => Number(a.tarjeta_real ?? 0)));
    const ordenes = d.rappi.filter((o) => o.fecha === fecha);
    const rappi = suma(ordenes.filter((o) => !o.turbo).map((o) => Number(o.subtotal)));
    const turbo = suma(ordenes.filter((o) => o.turbo).map((o) => Number(o.subtotal)));
    const dodo = d.dodo.filter((v) => v.fecha === fecha);
    const rappiReal = suma(delDia.map((a) => Number(a.rappi_real ?? 0)));
    return {
      fecha, efectivo, tarjeta, rappi, turbo,
      total: suma([efectivo, tarjeta, rappi, turbo]),
      sinArqueos,
      sinPortal: ordenes.length === 0 && fecha < hoy,
      difEfectivo: sinArqueos || dodo.length === 0 ? null : centavos(efectivo - suma(dodo.map((v) => Number(v.efectivo)))),
      difRappi: sinArqueos ? null : centavos(rappi + turbo - rappiReal),
    };
  });

  const col = (k: "efectivo" | "tarjeta" | "rappi" | "turbo" | "total") => suma(dias.map((x) => x[k]));
  const semana = {
    efectivo: col("efectivo"), tarjeta: col("tarjeta"), rappi: col("rappi"), turbo: col("turbo"), total: col("total"),
    difEfectivo: suma(dias.map((x) => x.difEfectivo ?? 0)), difRappi: suma(dias.map((x) => x.difRappi ?? 0)),
  };

  // NetPay deposita a los 1 a 3 días hábiles: de martes de la semana a jueves siguiente.
  const desde = sumarDias(lunes, 1);
  const hasta = sumarDias(lunes, 10);
  const enRango = (m: MovNetPay) => m.fecha >= desde && m.fecha <= hasta;
  const propio = (m: MovNetPay) => m.conciliadoSemana === lunes || (m.conciliadoSemana === null && enRango(m));
  const depositado = suma(d.netpay.filter((m) => m.tipo === "deposito" && propio(m)).map((m) => Number(m.monto)));
  const comisiones = suma(d.netpay.filter((m) => m.tipo === "comision" && propio(m)).map((m) => Number(m.monto)));
  const pendiente = d.ultimoMovimiento === null || d.ultimoMovimiento < hasta;
  return {
    dias, semana,
    netpay: {
      tarjeta: semana.tarjeta, depositado, comisiones,
      diferencia: pendiente ? null : centavos(semana.tarjeta - (depositado + comisiones)),
      pendiente, ultimoMovimiento: d.ultimoMovimiento,
    },
  };
}

const DIAS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const etiquetaDia = (fecha: string) => `${DIAS_ES[new Date(`${fecha}T00:00:00Z`).getUTCDay()]} ${Number(fecha.slice(8, 10))}`;

/** Lista legible de lo que cambió en las cifras desde que se aprobó el cierre (diferencias mayores a $1). */
export function cambiosDesdeAprobacion(aprobado: CierreSemanal, actual: CierreSemanal): string[] {
  const cambios: string[] = [];
  const campos = ["efectivo", "tarjeta", "rappi", "turbo", "total"] as const;
  for (const dia of actual.dias) {
    const antes = aprobado.dias.find((x) => x.fecha === dia.fecha);
    if (!antes) continue;
    for (const c of campos) {
      if (Math.abs(dia[c] - antes[c]) > 1) cambios.push(`${etiquetaDia(dia.fecha)}: ${c} ${pesos(antes[c])} → ${pesos(dia[c])}`);
    }
  }
  if (Math.abs(actual.netpay.depositado - aprobado.netpay.depositado) > 1) {
    cambios.push(`NetPay: depositado ${pesos(aprobado.netpay.depositado)} → ${pesos(actual.netpay.depositado)}`);
  }
  return cambios;
}
