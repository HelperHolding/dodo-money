import { porcentaje } from "@/lib/formato";
import { SECCIONES_FLUJO, type Flujo } from "@/lib/finanzas/flujo";
import { Importe } from "../Importe";

/** Un mes: secciones de la plantilla con monto y % de ingresos operativos. */
export function TablaFlujo({ flujo, mostrar }: { flujo: Flujo; mostrar: ReadonlySet<string> }) {
  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas tabla-pl">
          <caption className="solo-lector">Flujo de efectivo del mes</caption>
          <thead><tr><th>Renglón</th><th className="monto">Monto</th><th className="monto">% de ingresos</th></tr></thead>
          {SECCIONES_FLUJO.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion ${s.css}`}><th colSpan={3} scope="rowgroup">{s.nombre}</th></tr>
              {flujo.renglones.filter((r) => r.seccion === s.clave && mostrar.has(r.clave)).map((r) => (
                <tr key={r.clave} className={r.tipo === "total" ? "pl-total" : undefined}>
                  <td data-label="Renglón"><strong>{r.nombre}</strong></td>
                  <td data-label="Monto" className="monto"><Importe n={r.monto} /></td>
                  <td data-label="% de ingresos" className="monto">{porcentaje(r.pct)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

/** Meses lado a lado y su total; la columna de renglones queda fija al deslizar. */
export function TablaFlujoComparativo({ columnas, total, mostrar }: { columnas: { etiqueta: string; flujo: Flujo }[]; total: { etiqueta: string; flujo: Flujo }; mostrar: ReadonlySet<string> }) {
  const todas = [...columnas, total];
  const clase = (i: number) => `monto${i === columnas.length ? " pl-col-total" : ""}`;
  return (
    <section className="seccion">
      <div className="tabla-contenedor tabla-deslizable">
        <table className="tabla tabla-pl tabla-comparativo">
          <caption className="solo-lector">Flujo de efectivo comparativo</caption>
          <thead><tr><th>Renglón</th>{todas.map((c, i) => <th key={i} className={clase(i)}>{c.etiqueta}</th>)}</tr></thead>
          {SECCIONES_FLUJO.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion ${s.css}`}><th colSpan={todas.length + 1} scope="rowgroup"><span className="pl-seccion-nombre">{s.nombre}</span></th></tr>
              {total.flujo.renglones.filter((r) => r.seccion === s.clave && mostrar.has(r.clave)).map((r) => (
                <tr key={r.clave} className={r.tipo === "total" ? "pl-total" : undefined}>
                  <th scope="row">{r.nombre}</th>
                  {todas.map((c, i) => <td key={i} className={clase(i)}><Importe n={c.flujo.renglones.find((x) => x.clave === r.clave)!.monto} /></td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
