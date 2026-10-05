import { pesos, porcentaje } from "@/lib/formato";
import { NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import type { EntradaPL, FilaPL } from "@/lib/finanzas/pl";

type Detalle = { texto: string; monto: number }[];
const NOMBRE_MEMO = { insumos: NOMBRE_CUENTA.insumos, inversiones: NOMBRE_CUENTA.inversiones } as const;

/** Tabla del P&L: real, %, meta, diferencia, mes anterior y acumulado, con el detalle de cada renglón. */
export function TablaPL({ r, oficina }: {
  r: {
    filas: FilaPL[]; entrada: EntradaPL; anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
    detalleDe: (renglon: string) => Detalle; memoDetalle: (cuenta: "insumos" | "inversiones") => Detalle;
  };
  /** Total de oficina central del mes (solo en el consolidado). */
  oficina: number | null;
}) {
  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas">
          <thead>
            <tr><th>Renglón</th><th className="monto">Real</th><th className="monto">%</th><th className="monto">Meta %</th><th className="monto">Dif.</th><th className="monto" title="% del mes anterior">Mes ant.</th><th className="monto" title="% acumulado del año">Año</th></tr>
          </thead>
          <tbody>
            {r.filas.map((f) => {
              const items = r.detalleDe(f.clave);
              const pasa = f.tipo === "gasto" && f.diferencia !== null && f.diferencia > 0;
              const falta = f.tipo === "total" && f.diferencia !== null && f.diferencia < 0;
              return (
                <tr key={f.clave} className={f.tipo === "total" ? "fila-total" : undefined}>
                  <td data-label="Renglón">
                    <span className="celda-pila">
                      <strong>{f.nombre}</strong>
                      {items.length > 0 && (
                        <details>
                          <summary className="saldo-nota">De dónde sale ({items.length})</summary>
                          <ul className="lista-simple">{items.map((i, n) => <li key={n}>{i.texto} · {pesos(i.monto)}</li>)}</ul>
                        </details>
                      )}
                    </span>
                  </td>
                  <td data-label="Real" className="monto">{f.monto === null ? "Sin dato" : pesos(f.monto)}</td>
                  <td data-label="%" className="monto">{porcentaje(f.pct)}</td>
                  <td data-label="Meta %" className="monto">{porcentaje(f.metaPct)}</td>
                  <td data-label="Diferencia" className={`monto${pasa || falta ? " celda-alerta" : ""}`}>{f.diferencia === null ? "—" : pesos(f.diferencia)}</td>
                  <td data-label="Mes anterior %" className="monto">{r.anterior ? porcentaje(r.anterior.get(f.clave) ?? null) : "—"}</td>
                  <td data-label="Acumulado %" className="monto">{porcentaje(r.acumulado.get(f.clave) ?? null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="tarjeta-datos">
        <dt>Descuentos (informativo)</dt><dd>{pesos(r.entrada.descuentos)}</dd>
        {(["insumos", "inversiones"] as const).map((m) => (
          <div key={m} style={{ display: "contents" }}>
            <dt>{NOMBRE_MEMO[m]}</dt>
            <dd>
              {pesos(r.entrada.memos[m])}
              {r.memoDetalle(m).length > 0 && (
                <details><summary className="saldo-nota">Facturas ({r.memoDetalle(m).length})</summary>
                  <ul className="lista-simple">{r.memoDetalle(m).map((i, n) => <li key={n}>{i.texto} · {pesos(i.monto)}</li>)}</ul>
                </details>
              )}
            </dd>
          </div>
        ))}
        {oficina !== null && <><dt>Oficina central del mes</dt><dd>{pesos(oficina)}</dd></>}
      </dl>
    </section>
  );
}
