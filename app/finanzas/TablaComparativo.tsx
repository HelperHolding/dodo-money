import { porcentaje } from "@/lib/formato";
import { CUENTAS_MEMO, NOMBRE_MEMO } from "@/lib/finanzas/cuentas";
import type { ColumnaPL } from "@/lib/finanzas/excel";
import { esDetalleNomina, RENGLONES, type ClaveRenglon } from "@/lib/finanzas/pl";
import { SECCIONES } from "@/lib/finanzas/secciones";
import { Importe } from "./Importe";
import { referenciaHelper } from '@/lib/finanzas/catalogoHelper';

const NOMBRE = new Map(RENGLONES.map((r) => [r.clave, r.nombre]));

/** Periodos lado a lado (meses del año o semanas del mes) y su total: monto y, debajo, % de venta. */
export function TablaComparativo({ columnas, total }: { columnas: ColumnaPL[]; total: ColumnaPL }) {
  const todas = [...columnas, total];
  const ancho = todas.length + 1;
  const clase = (i: number) => `monto${i === columnas.length ? " pl-col-total" : ""}`;
  const renglon = (clave: ClaveRenglon, esTotal: boolean) => (
    <tr key={clave} className={esTotal ? "pl-total" : RENGLONES.find(r => r.clave === clave)?.tipo === "detalle" ? "pl-desglose" : undefined}>
      <th scope="row">{total.filas.find(f=>f.clave===clave)?.nombre ?? NOMBRE.get(clave)}{referenciaHelper(clave)&&<small className="pl-pct">Referencia: {referenciaHelper(clave)}</small>}</th>
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
              <tr className={`pl-seccion pl-${s.clave}`}><th colSpan={ancho} scope="rowgroup"><span className="pl-seccion-nombre">{s.nombre}</span></th></tr>
              {s.renglones.filter((c) => !esDetalleNomina(c) || todas.some((t) => t.filas.find((f) => f.clave === c)?.monto)).map((c) => renglon(c, false))}
              {s.total && renglon(s.total, true)}
            </tbody>
          ))}
          <tbody>
            <tr className="pl-seccion pl-memo"><th colSpan={ancho} scope="rowgroup"><span className="pl-seccion-nombre">Memo</span></th></tr>
            {CUENTAS_MEMO.map((m) => simple(m, NOMBRE_MEMO[m], (c) => c.entrada.memos[m] ?? 0))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
