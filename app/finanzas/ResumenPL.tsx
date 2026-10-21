import { Icono } from "@/components/Icono";
import { pesos, porcentaje } from "@/lib/formato";
import type { ClaveRenglon, FilaPL } from "@/lib/finanzas/pl";

/** Diferencia en puntos entre el % real y el % meta, solo para mostrarla ("+1.2 pts"). */
const puntos = (real: number | null, meta: number | null) => (real === null || meta === null ? null : (real - meta) * 100);
const textoPuntos = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)} pts`;

/**
 * Lectura rápida del P&L contra meta, arriba de la tabla: los cuatro totales, la cascada de la venta al EBITDA
 * y los renglones de gasto que se pasan de la meta. Usa las filas que ya calculó calcularPL; no recalcula nada.
 */
export function ResumenPL({ filas }: { filas: readonly FilaPL[] }) {
  const de = new Map(filas.map((f) => [f.clave, f]));
  const fila = (c: ClaveRenglon) => de.get(c);
  const totales = (["venta_neta", "margen_bruto", "ebitda_tienda", "ebitda"] as const).map((c) => fila(c)).filter((f): f is FilaPL => !!f);
  const pasados = filas.filter((f) => f.tipo === "gasto" && !f.sinCapturar && f.diferencia !== null && f.diferencia > 0)
    .sort((a, b) => (b.diferencia ?? 0) - (a.diferencia ?? 0)).slice(0, 5);

  return (
    <>
      <div className="indicadores-marco"><section className="indicadores" aria-label="Totales del periodo">
        {totales.map((f) => {
          const p = f.clave === "venta_neta" ? null : puntos(f.pct, f.metaPct);
          const falta = f.diferencia !== null && f.diferencia < 0;
          return (
            <div key={f.clave} className="indicador" data-alerta={f.clave === "ebitda" && f.monto !== null && f.monto < 0 ? "peligro" : undefined}>
              <span className="indicador-etiqueta">{f.nombre}</span>
              <strong className="indicador-valor">{f.monto === null ? "Sin dato" : pesos(f.monto)}</strong>
              {f.clave === "venta_neta" ? (
                <span className="indicador-cambio" data-favorable={f.diferencia === null ? undefined : falta ? "no" : "si"}>
                  {f.meta === null ? "Sin meta" : <>{falta ? <Icono nombre="baja" /> : <Icono nombre="sube" />}Meta {pesos(f.meta)}</>}
                </span>
              ) : (
                <span className="indicador-cambio" data-favorable={p === null ? undefined : p >= 0 ? "si" : "no"}>
                  {porcentaje(f.pct)} de la venta{p !== null && <> · {textoPuntos(p)} vs meta</>}
                </span>
              )}
            </div>
          );
        })}
      </section></div>

      <div className="panel-fila">
        <Cascada filas={de} />
        <section className="seccion" aria-labelledby="t-pasados">
          <div className="seccion-cabecera">
            <h2 id="t-pasados">Dónde se pasa de la meta</h2>
            <span className="insignia" data-tono={pasados.length ? "peligro" : "exito"}>{pasados.length ? `${pasados.length} renglones` : "Todo dentro"}</span>
          </div>
          {!pasados.length ? (
            <p className="panel-todo-bien"><Icono nombre="ok" tamano={22} />Ningún gasto supera su meta en este periodo.</p>
          ) : (
            <ul className="metas-pasadas">
              {pasados.map((f) => {
                const tope = Math.max(f.pct ?? 0, f.metaPct ?? 0) || 1;
                return (
                  <li key={f.clave}>
                    <p><strong>{f.nombre}</strong><span className="texto-alerta">+{pesos(f.diferencia ?? 0)}</span></p>
                    <div className="meta-barras" aria-hidden="true">
                      <span className="meta-real" style={{ width: `${((f.pct ?? 0) / tope) * 100}%` }} />
                      <span className="meta-tope" style={{ left: `${((f.metaPct ?? 0) / tope) * 100}%` }} />
                    </div>
                    <small>Real {porcentaje(f.pct)} · meta {porcentaje(f.metaPct)} de la venta</small>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** De la venta neta al EBITDA: los totales como columnas llenas y cada bloque de gasto como el escalón que baja. */
function Cascada({ filas }: { filas: ReadonlyMap<string, FilaPL> }) {
  const m = (c: ClaveRenglon) => filas.get(c)?.monto ?? null;
  const venta = m("venta_neta"), margen = m("margen_bruto"), tienda = m("ebitda_tienda"), ebitda = m("ebitda");
  if (venta === null || margen === null || tienda === null || ebitda === null || venta <= 0) return null;
  const pasos: { nombre: string; desde: number; hasta: number; tipo: "total" | "baja" | "final" }[] = [
    { nombre: "Venta neta", desde: 0, hasta: venta, tipo: "total" },
    { nombre: "Costo de venta", desde: venta, hasta: margen, tipo: "baja" },
    { nombre: "Margen bruto", desde: 0, hasta: margen, tipo: "total" },
    { nombre: "Gastos de operación", desde: margen, hasta: tienda, tipo: "baja" },
    { nombre: "EBITDA de tienda", desde: 0, hasta: tienda, tipo: "total" },
    { nombre: "Oficina central", desde: tienda, hasta: ebitda, tipo: "baja" },
    { nombre: "EBITDA", desde: 0, hasta: ebitda, tipo: "final" },
  ];
  const alto = Math.max(venta, margen, tienda, ebitda, 0), bajo = Math.min(0, margen, tienda, ebitda), rango = alto - bajo || 1;
  const y = (v: number) => ((alto - v) / rango) * 100;
  return (
    <section className="seccion" aria-labelledby="t-cascada">
      <div className="seccion-cabecera">
        <h2 id="t-cascada">De la venta al EBITDA</h2>
      </div>
      <div className="cascada" role="img" aria-label={pasos.map((p) => `${p.nombre} ${pesos(p.tipo === "baja" ? p.hasta - p.desde : p.hasta)}`).join(", ")}>
        <span className="cascada-cero" style={{ "--y": y(0) } as React.CSSProperties} />
        {pasos.map((p) => {
          const arriba = Math.max(p.desde, p.hasta), abajo = Math.min(p.desde, p.hasta);
          const valor = p.tipo === "baja" ? p.hasta - p.desde : p.hasta;
          return (
            <div key={p.nombre} className="cascada-col" data-tipo={p.tipo} data-negativo={p.tipo === "final" && p.hasta < 0 ? "si" : undefined}>
              <span className="cascada-barra" style={{ top: `${y(arriba)}%`, height: `${Math.max(0.6, y(abajo) - y(arriba))}%` }}>
                <b>{pesos(valor)}</b>
              </span>
              <small>{p.nombre}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
