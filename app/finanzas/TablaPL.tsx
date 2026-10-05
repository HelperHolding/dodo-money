import { pesos, porcentaje } from "@/lib/formato";
import { NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import type { Columnas } from "@/lib/finanzas/periodo";
import type { EntradaPL, FilaPL } from "@/lib/finanzas/pl";
import { SECCIONES } from "@/lib/finanzas/secciones";
import { Importe } from "./Importe";

type Detalle = { texto: string; monto: number }[];
const NOMBRE_MEMO = { insumos: NOMBRE_CUENTA.insumos, inversiones: NOMBRE_CUENTA.inversiones } as const;

const desplegable = (items: Detalle, rotulo: string) =>
  items.length > 0 && (
    <details>
      <summary className="saldo-nota">{rotulo} ({items.length})</summary>
      <ul className="lista-simple">{items.map((i, n) => <li key={n}>{i.texto} · {pesos(i.monto)}</li>)}</ul>
    </details>
  );

/** P&L contra meta como estado de resultados: secciones con color, subtotales en barra y montos contables. */
export function TablaPL({ r, columnas, conDetalle = true }: {
  r: {
    filas: FilaPL[]; entrada: EntradaPL; anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
    detalleDe: (renglon: string) => Detalle; memoDetalle: (cuenta: "insumos" | "inversiones") => Detalle;
  };
  /** Encabezados de las comparaciones (mes o semana). */
  columnas: Columnas;
  /** En el PDF no se despliega de dónde sale cada renglón. */
  conDetalle?: boolean;
}) {
  const de = new Map(r.filas.map((f) => [f.clave, f]));
  const pctDe = (m: ReadonlyMap<string, number | null> | null, clave: string) => (m ? porcentaje(m.get(clave) ?? null) : "—");

  const renglon = (f: FilaPL) => {
    const total = f.tipo === "total";
    const pasa = f.tipo === "gasto" && f.diferencia !== null && f.diferencia > 0;
    const falta = total && f.diferencia !== null && f.diferencia < 0;
    return (
      <tr key={f.clave} className={total ? "pl-total" : undefined}>
        <td data-label="Renglón">
          <span className="celda-pila"><strong>{f.nombre}</strong>{conDetalle && desplegable(r.detalleDe(f.clave), "De dónde sale")}</span>
        </td>
        <td data-label="Real" className="monto"><Importe n={f.monto} /></td>
        <td data-label="%" className="monto">{porcentaje(f.pct)}</td>
        <td data-label="Meta %" className="monto">{porcentaje(f.metaPct)}</td>
        <td data-label="Diferencia" className={`monto${pasa || falta ? " celda-alerta" : ""}`}>{f.diferencia === null ? "—" : <Importe n={f.diferencia} />}</td>
        <td data-label={columnas.anterior} className="monto">{pctDe(r.anterior, f.clave)}</td>
        <td data-label={columnas.acumulado} className="monto">{pctDe(r.acumulado, f.clave)}</td>
      </tr>
    );
  };
  const informativo = (clave: string, nombre: string, monto: number, items: Detalle) => (
    <tr key={clave} className="pl-informativo">
      <td data-label="Renglón"><span className="celda-pila"><strong>{nombre}</strong>{conDetalle && desplegable(items, "Facturas")}</span></td>
      <td data-label="Real" className="monto"><Importe n={monto} /></td>
      <td data-label="" colSpan={5} />
    </tr>
  );

  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas tabla-pl">
          <thead>
            <tr>
              <th>Renglón</th><th className="monto">Real</th><th className="monto">%</th><th className="monto">Meta %</th><th className="monto">Dif.</th>
              <th className="monto" title={columnas.anterior}>{columnas.anteriorCorto}</th><th className="monto" title={columnas.acumulado}>{columnas.acumuladoCorto}</th>
            </tr>
          </thead>
          {SECCIONES.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion pl-${s.clave}`}><th colSpan={7} scope="rowgroup">{s.nombre}</th></tr>
              {s.renglones.map((c) => de.get(c)).filter((f): f is FilaPL => Boolean(f)).map(renglon)}
              {s.clave === "venta" && informativo("descuentos", "Descuentos (informativo)", r.entrada.descuentos, [])}
              {s.total && de.has(s.total) && renglon(de.get(s.total)!)}
            </tbody>
          ))}
          <tbody>
            <tr className="pl-seccion pl-memo"><th colSpan={7} scope="rowgroup">Memo</th></tr>
            {(["insumos", "inversiones"] as const).map((m) => informativo(m, NOMBRE_MEMO[m], r.entrada.memos[m], r.memoDetalle(m)))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
