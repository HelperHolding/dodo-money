"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { pesos } from "@/lib/formato";
import { cifraContable } from "@/lib/finanzas/secciones";
import type { GrupoCuenta } from "@/lib/finanzas/reporteCuentas";
import type { FilaCuenta } from "./cuentasDatos";

type Columna = { etiqueta: string; desde: string; hasta: string };
type Seleccion = { nombre: string; periodo: Columna; grupos: GrupoCuenta[]; monto: number };
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Fusiona columnas para abrir el acumulado con las mismas aportaciones que los meses. */
function acumular(grupos: readonly GrupoCuenta[]): GrupoCuenta[] {
  const resultado = new Map<string, GrupoCuenta>();
  for (const g of grupos) {
    const previo = resultado.get(g.id);
    resultado.set(g.id, previo
      ? { ...previo, monto: redondear(previo.monto + g.monto), items: [...previo.items, ...g.items] }
      : { ...g, items: [...g.items] });
  }
  return [...resultado.values()];
}

export default function TablaCuentas({ filas, columnas }: { filas: FilaCuenta[]; columnas: Columna[] }) {
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<Seleccion | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloDialogo = useId();
  const periodoTotal = { etiqueta: "Acumulado", desde: columnas[0]?.desde ?? "", hasta: columnas.at(-1)?.hasta ?? "" };

  const abrir = (nombre: string, periodo: Columna, grupos: GrupoCuenta[], monto: number) => {
    setDetalle({ nombre, periodo, grupos, monto });
    dialogo.current?.showModal();
  };
  const cambiar = (clave: string) => setCerradas(actual => {
    const nuevo = new Set(actual);
    if (nuevo.has(clave)) nuevo.delete(clave); else nuevo.add(clave);
    return nuevo;
  });
  const importe = (nombre: string, periodo: Columna, grupos: GrupoCuenta[], monto: number | null) =>
    grupos.length && monto !== null
      ? <button className="pl-importe-enlace" aria-label={`${nombre}, ${periodo.etiqueta}: ${pesos(monto)}. Ver documentos`} onClick={() => abrir(nombre, periodo, grupos, monto)}>{cifraContable(monto)}</button>
      : cifraContable(monto);

  return <section className="seccion pl-cuentas">
    <div className="barra-filtros">
      <button className="boton boton-secundario boton-compacto" onClick={() => setCerradas(new Set(filas.map(f => f.clave)))}>Contraer subcuentas</button>
      <button className="boton boton-secundario boton-compacto" onClick={() => setCerradas(new Set())}>Expandir subcuentas</button>
      <small>Haz clic en un importe para consultar sus documentos y cálculo. MXN, sin IVA.</small>
    </div>
    <div className="tabla-contenedor tabla-deslizable">
      <table className="tabla tabla-pl tabla-cuentas">
        <thead><tr>
          <th scope="col">Cuenta / concepto</th><th scope="col">Código de cuenta</th>
          {columnas.map(c => <th scope="col" className="monto" key={c.desde}>{c.etiqueta}<small className="pl-pct">{c.desde} — {c.hasta}</small></th>)}
          <th scope="col" className="monto">Acumulado</th>
        </tr></thead>
        {filas.map(f => {
          const grupos = acumular(f.celdas.flatMap(c => c.grupos));
          const total = f.celdas.some(c => c.monto === null) ? null : redondear(f.celdas.reduce((s, c) => s + (c.monto ?? 0), 0));
          return <tbody key={f.clave}>
            <tr className={f.tipo === "total" ? "pl-total" : f.tipo === "memo" ? "pl-informativo" : "pl-cuenta-padre"}>
              <th scope="row">{grupos.length > 0 && f.tipo !== "total"
                ? <button className="pl-expandir" aria-expanded={!cerradas.has(f.clave)} onClick={() => cambiar(f.clave)}><span aria-hidden="true">{cerradas.has(f.clave) ? "＋" : "−"}</span> {f.nombre}</button>
                : f.nombre}</th>
              <td>{f.tipo === "memo" ? "Memo" : f.tipo === "total" ? "Total" : "Subtotal"}</td>
              {f.celdas.map((c, i) => <td className="monto" key={columnas[i].desde}>{importe(f.nombre, columnas[i], c.grupos, c.monto)}</td>)}
              <td className="monto"><strong>{importe(f.nombre, periodoTotal, grupos, total)}</strong></td>
            </tr>
            {f.tipo !== "total" && !cerradas.has(f.clave) && grupos.sort((a, b) => (a.codigo ?? "z").localeCompare(b.codigo ?? "z") || a.nombre.localeCompare(b.nombre)).map(g =>
              <tr key={g.id} className="pl-cuenta-hija">
                <th scope="row">{g.nombre}</th><td>{g.codigo ?? (g.estado === "Fuente calculada" ? "Modelo" : "Sin asignar")}</td>
                {f.celdas.map((c, i) => {
                  const grupo = c.grupos.find(x => x.id === g.id);
                  return <td className="monto" key={columnas[i].desde}>{grupo ? importe(g.nombre, columnas[i], [grupo], grupo.monto) : "-"}</td>;
                })}
                <td className="monto">{importe(g.nombre, periodoTotal, [g], g.monto)}</td>
              </tr>)}
          </tbody>;
        })}
      </table>
    </div>
    <dialog ref={dialogo} className="pl-dialogo" aria-labelledby={tituloDialogo} onClick={e => { if (e.target === e.currentTarget) dialogo.current?.close(); }}>
      {detalle && <>
        <div className="pl-dialogo-cabecera">
          <div><h2 id={tituloDialogo}>{detalle.nombre}</h2><p>{detalle.periodo.desde} al {detalle.periodo.hasta} · Aportación al P&L: <strong>{pesos(detalle.monto)}</strong></p></div>
          <button className="boton boton-secundario" autoFocus onClick={() => dialogo.current?.close()} aria-label="Cerrar detalle">Cerrar</button>
        </div>
        <p>El importe corresponde al periodo devengado, después de descuentos y sin IVA. Las notas de crédito restan. Un documento puede aportar a varias cuentas.</p>
        <div className="tabla-contenedor"><table className="tabla">
          <thead><tr><th>Fecha</th><th>Documento / concepto</th><th>Proveedor / razón social</th><th>Cuenta</th><th>UUID</th><th className="monto">Aportación</th></tr></thead>
          <tbody>{detalle.grupos.flatMap(g => g.items.map((item, i) => <tr key={`${g.id}-${i}`}>
            <td>{item.fecha ?? "Periodo"}</td>
            <td>{item.href ? <Link href={item.href}>{item.texto}</Link> : item.texto}{item.nota && <small className="pl-pct">{item.nota}</small>}</td>
            <td>{item.proveedor ?? "—"}<small className="pl-pct">{item.rfc ?? "Sin razón social identificada"}</small></td>
            <td>{g.codigo ?? g.estado}{item.clave && !g.codigo && <><br /><Link href={`/finanzas/asignacion/${encodeURIComponent(item.clave)}`}>Revisar cuenta</Link></>}</td>
            <td className="pl-uuid">{item.uuid ?? "—"}</td><td className="monto">{pesos(item.monto)}</td>
          </tr>))}</tbody>
          <tfoot><tr><th colSpan={5}>Total del importe seleccionado</th><td className="monto"><strong>{pesos(detalle.monto)}</strong></td></tr></tfoot>
        </table></div>
      </>}
    </dialog>
  </section>;
}
