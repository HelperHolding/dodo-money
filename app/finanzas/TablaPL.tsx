import Link from "next/link";
import type { ReactNode } from "react";
import { pesos, porcentaje } from "@/lib/formato";
import { CUENTAS_MEMO, NOMBRE_MEMO, type CuentaMemo } from "@/lib/finanzas/cuentas";
import type { Columnas } from "@/lib/finanzas/periodo";
import { esDetalleNomina, type EntradaPL, type FilaPL } from "@/lib/finanzas/pl";
import { SECCIONES } from "@/lib/finanzas/secciones";
import { Importe } from "./Importe";
import { referenciaHelper } from '@/lib/finanzas/catalogoHelper';

export type Detalle = { texto: string; monto: number; href?: string; nota?: string }[];

export const desplegable = (items: Detalle, rotulo: string) =>
  items.length > 0 && (
    <details className="pl-origen">
      <summary className="saldo-nota">{rotulo} ({items.length})</summary>
      <ul className="pl-origen-lista">{items.map((i, n) => (
        <li key={n}>
          <div className="pl-origen-cabecera">
            {i.href ? <Link href={i.href}>{i.texto}</Link> : <span>{i.texto}</span>}
            <strong className="pl-origen-monto">{pesos(i.monto)}</strong>
          </div>
          {i.nota && <small className="pl-origen-nota">{i.nota}</small>}
        </li>
      ))}</ul>
    </details>
  );

/** P&L contra meta como estado de resultados: secciones con color, subtotales en barra y montos contables. */
export function TablaPL({ r, columnas, impresa = false, ajustado = null, sinHistoria = false, rotuloMonto = "Real", captura }: {
  r: {
    filas: FilaPL[]; entrada: EntradaPL; anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
    detalleDe: (renglon: string) => Detalle; memoDetalle: (cuenta: CuentaMemo) => Detalle;
  };
  /** Encabezados de las comparaciones (mes o semana). */
  columnas: Columnas;
  /** PDF: sin referencias contables ni de dónde sale cada renglón, un valor por celda y siempre como tabla (cabe en una hoja). */
  impresa?: boolean;
  /** Filas del P&L ajustado (misma sucursal y periodo): agrega Ajuste, Ajustado y su %. Meta y Diferencia siguen contra el real. */
  ajustado?: readonly FilaPL[] | null;
  /** PDF con real y ajustado: sin las dos comparaciones para que quepa. */
  sinHistoria?: boolean;
  /** Encabezado de la columna del monto ("Ajustado" en el PDF ajustado). */
  rotuloMonto?: string;
  /** Admin, sucursal y mes: lo que va bajo el nombre del renglón (el formulario "Ajustar"). */
  captura?: (f: FilaPL) => ReactNode;
}) {
  const conDetalle = !impresa;
  const nombre = (texto: string) => (impresa ? texto : <strong>{texto}</strong>);
  const de = new Map(r.filas.map((f) => [f.clave, f]));
  const aj = ajustado ? new Map(ajustado.map((f) => [f.clave, f])) : null;
  const columnasTotal = 5 + (aj ? 3 : 0) + (sinHistoria ? 0 : 2);
  const pctDe = (m: ReadonlyMap<string, number | null> | null, clave: string) => (m ? porcentaje(m.get(clave) ?? null) : "—");

  const renglon = (f: FilaPL) => {
    const total = f.tipo === "total";
    const pasa = f.tipo === "gasto" && f.diferencia !== null && f.diferencia > 0;
    const falta = total && f.diferencia !== null && f.diferencia < 0;
    return (
      <tr key={f.clave} className={total ? "pl-total" : f.tipo === "detalle" ? "pl-desglose" : undefined}>
        <td data-label="Renglón">
          <span className="celda-pila">{nombre(f.nombre)}{conDetalle && referenciaHelper(f.clave)&&<small>Referencia contable: {referenciaHelper(f.clave)}</small>}{conDetalle && desplegable(r.detalleDe(f.clave), "De dónde sale")}{captura?.(f)}</span>
        </td>
        <td data-label={rotuloMonto} className="monto"><Importe n={f.monto} /></td>
        <td data-label="%" className="monto">{porcentaje(f.pct)}</td>
        {aj && (() => {
          const a = aj.get(f.clave);
          const ajuste = a && a.monto !== null && f.monto !== null ? Math.round((a.monto - f.monto) * 100) / 100 : 0;
          return <>
            <td data-label="Ajuste" className="monto">{ajuste ? <Importe n={ajuste} /> : "—"}</td>
            <td data-label="Ajustado" className="monto"><Importe n={a?.monto ?? f.monto} /></td>
            <td data-label="% ajustado" className="monto">{porcentaje(a?.pct ?? f.pct)}</td>
          </>;
        })()}
        <td data-label="Meta" className="monto">
          {f.metaFija ? <><Importe n={f.meta} />{conDetalle && <small className="pl-pct">{porcentaje(f.metaPct)}</small>}</> : porcentaje(f.metaPct)}
        </td>
        <td data-label="Diferencia" className={`monto${pasa || falta || f.sinCapturar ? " celda-alerta" : ""}`}>
          {f.sinCapturar ? "Sin capturar" : f.diferencia === null ? "—" : <Importe n={f.diferencia} />}
        </td>
        {!sinHistoria && <>
          <td data-label={columnas.anterior} className="monto">{pctDe(r.anterior, f.clave)}</td>
          <td data-label={columnas.acumulado} className="monto">{pctDe(r.acumulado, f.clave)}</td>
        </>}
      </tr>
    );
  };
  const informativo = (clave: string, texto: string, monto: number, items: Detalle) => (
    <tr key={clave} className="pl-informativo">
      <td data-label="Renglón"><span className="celda-pila">{nombre(texto)}{conDetalle && desplegable(items, "Facturas")}</span></td>
      <td data-label={rotuloMonto} className="monto"><Importe n={monto} /></td>
      <td data-label="" colSpan={columnasTotal - 2} />
    </tr>
  );

  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className={(impresa ? "tabla tabla-pl tabla-pl-impresa" : "tabla tabla-tarjetas tabla-pl") + (aj ? " tabla-pl-ambas" : "")}>
          <thead>
            <tr>
              <th>Renglón</th><th className="monto">{rotuloMonto}</th><th className="monto">%</th>
              {aj && <><th className="monto">Ajuste</th><th className="monto">Ajustado</th><th className="monto">% aj.</th></>}
              <th className="monto" title="En pesos para los costos fijos; en % de la venta para los demás">Meta</th><th className="monto">Dif.</th>
              {!sinHistoria && <><th className="monto" title={columnas.anterior}>{columnas.anteriorCorto}</th><th className="monto" title={columnas.acumulado}>{columnas.acumuladoCorto}</th></>}
            </tr>
          </thead>
          {SECCIONES.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion pl-${s.clave}`}><th colSpan={columnasTotal} scope="rowgroup">{s.nombre}</th></tr>
              {s.renglones.map((c) => de.get(c)).filter((f): f is FilaPL => Boolean(f) && !(esDetalleNomina(f!.clave) && !f!.monto && !aj?.get(f!.clave)?.monto)).map(renglon)}
              {s.total && de.has(s.total) && renglon(de.get(s.total)!)}
            </tbody>
          ))}
          <tbody>
            <tr className="pl-seccion pl-memo"><th colSpan={columnasTotal} scope="rowgroup">Memo</th></tr>
            {CUENTAS_MEMO.map((m) => informativo(m, NOMBRE_MEMO[m], r.entrada.memos[m], r.memoDetalle(m)))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
