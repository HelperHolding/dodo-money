import { porcentaje } from "@/lib/formato";
import { SECCIONES_ASESORES, type FormatoAsesores, type RenglonAsesores } from "@/lib/finanzas/formatoAsesores";
import { Importe } from "./Importe";
import { desplegable, type Detalle } from "./TablaPL";

/** P&L con la estructura de la plantilla de los asesores: monto y % de ventas brutas (o netas si la bruta no está completa). */
export function TablaAsesores({ formato, detalleDe, conDetalle = true, ajustado = null }: {
  formato: FormatoAsesores;
  /** P&L ajustado: agrega Ajustado y su % junto al real. */
  ajustado?: FormatoAsesores | null;
  detalleDe: (origen: readonly string[]) => Detalle;
  conDetalle?: boolean;
}) {
  const base = formato.base === "bruta" ? "% de ventas brutas" : "% de ventas netas";
  const aj = ajustado ? new Map(ajustado.renglones.map((x) => [x.clave, x])) : null;
  const renglon = (r: RenglonAsesores) => (
    <tr key={r.clave} className={r.tipo === "total" ? "pl-total" : undefined}>
      <td data-label="Renglón">
        <span className="celda-pila">
          <strong>{r.nombre}</strong>
          {r.pendiente && r.monto !== null && <small>Provisional: hay montos pendientes</small>}
          {conDetalle && r.origen.length > 0 && desplegable(detalleDe(r.origen), "De dónde sale")}
        </span>
      </td>
      <td data-label="Monto" className="monto">{r.monto === null ? "Pendiente" : <Importe n={r.monto} />}</td>
      <td data-label={base} className="monto">{porcentaje(r.pct)}</td>
      {aj && <>
        <td data-label="Ajustado" className="monto">{aj.get(r.clave)?.monto == null ? "Pendiente" : <Importe n={aj.get(r.clave)!.monto!} />}</td>
        <td data-label={`${base} ajustado`} className="monto">{porcentaje(aj.get(r.clave)?.pct ?? null)}</td>
      </>}
    </tr>
  );
  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas tabla-pl">
          <caption className="solo-lector">Estado de resultados en formato de asesores</caption>
          <thead><tr><th>Renglón</th><th className="monto">Monto</th><th className="monto">{base}</th>{aj && <><th className="monto">Ajustado</th><th className="monto">% aj.</th></>}</tr></thead>
          {SECCIONES_ASESORES.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion ${s.css}`}><th colSpan={aj ? 5 : 3} scope="rowgroup">{s.nombre}</th></tr>
              {formato.renglones.filter((r) => r.seccion === s.clave).map(renglon)}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
