import { porcentaje } from "@/lib/formato";
import { NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import type { ColumnaPL } from "@/lib/finanzas/excel";
import { RENGLONES, type ClaveRenglon } from "@/lib/finanzas/pl";
import { SECCIONES } from "@/lib/finanzas/secciones";
import { Importe } from "./Importe";

const NOMBRE = new Map(RENGLONES.map((r) => [r.clave, r.nombre]));

/** Periodos lado a lado (meses del año o semanas del mes) y su total: monto y, debajo, % de venta. */
export function TablaComparativo({ columnas, total }: { columnas: ColumnaPL[]; total: ColumnaPL }) {
  const todas = [...columnas, total];
  const ancho = todas.length + 1;
  const clase = (i: number) => `monto${i === columnas.length ? " pl-col-total" : ""}`;
  const renglon = (clave: ClaveRenglon, esTotal: boolean) => (
    <tr key={clave} className={esTotal ? "pl-total" : undefined}>
      <th scope="row">{NOMBRE.get(clave)}</th>
      {todas.map((c, i) => {
        const f = c.filas.find((x) => x.clave === clave);
        return <td key={i} className={clase(i)}><Importe n={f?.monto ?? null} /><small className="pl-pct">{porcentaje(f?.pct ?? null)}</small></td>;
      })}
    </tr>
  );
  const simple = (clave: string, nombre: string, valor: (c: ColumnaPL) => number) => (
    <tr key={clave} className="pl-informativo">
      <th scope="row">{nombre}</th>
      {todas.map((c, i) => <td key={i} className={clase(i)}><Importe n={valor(c)} /></td>)}
    </tr>
  );
  return (
    <section className="seccion">
      <div className="tabla-contenedor tabla-deslizable">
        <table className="tabla tabla-pl tabla-comparativo">
          <thead><tr><th>Renglón</th>{todas.map((c, i) => <th key={i} className={clase(i)}>{c.etiqueta}</th>)}</tr></thead>
          {SECCIONES.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion pl-${s.clave}`}><th colSpan={ancho} scope="rowgroup">{s.nombre}</th></tr>
              {s.renglones.map((c) => renglon(c, false))}
              {s.clave === "venta" && simple("descuentos", "Descuentos (informativo)", (c) => c.entrada.descuentos)}
              {s.total && renglon(s.total, true)}
            </tbody>
          ))}
          <tbody>
            <tr className="pl-seccion pl-memo"><th colSpan={ancho} scope="rowgroup">Memo</th></tr>
            {simple("insumos", NOMBRE_CUENTA.insumos, (c) => c.entrada.memos.insumos)}
            {simple("inversiones", NOMBRE_CUENTA.inversiones, (c) => c.entrada.memos.inversiones)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
