"use client";

import { useState } from "react";
import { pesos, pesosCortos } from "@/lib/formato";
import { diasConEtiqueta } from "@/lib/ventas/tablero";

/** Un paso de la curva (un día, o una hora cuando el periodo es de un solo día). `actual` es null en días que aún no llegan. */
export type PasoCurva = { clave: string; rotulo: string; detalle: string; actual: number | null; anterior: number | null };

const enCentavos = (n: number) => Math.round(n * 100);
const escala = (max: number) => {
  const paso = 10 ** Math.floor(Math.log10(Math.max(1, max / 2)));
  return Math.ceil(max / 2 / paso) * paso * 2;
};

/**
 * Venta acumulada del periodo (línea naranja con área) contra el periodo anterior del mismo largo (línea gris).
 * Arriba se lee el acumulado del paso elegido (al inicio, el último con venta); pasar el mouse, tocar o usar las
 * flechas lo cambia. La gráfica estira solo las líneas: rótulos, puntos y grosores conservan su tamaño en celular.
 */
export function CurvaAcumulada({ titulo, pasos, actual, anterior }: {
  titulo: string; pasos: readonly PasoCurva[]; actual: string; anterior?: string;
}) {
  let a = 0, b = 0;
  const filas = pasos.map((p) => {
    if (p.actual !== null) a += enCentavos(p.actual);
    if (p.anterior !== null) b += enCentavos(p.anterior);
    return { ...p, sumaActual: p.actual === null ? null : a / 100, sumaAnterior: anterior && p.anterior !== null ? b / 100 : null };
  });
  const ultimo = filas.findLastIndex((f) => f.sumaActual !== null);
  const [elegido, setElegido] = useState<number | null>(null);
  if (filas.length < 2 || ultimo < 0) return null;
  const i = elegido ?? ultimo, f = filas[i];
  const tope = escala(Math.max(1, ...filas.map((x) => Math.max(x.sumaActual ?? 0, x.sumaAnterior ?? 0))));
  const x = (k: number) => ((k + 0.5) / filas.length) * 100;
  const y = (v: number) => 100 - (v / tope) * 100;
  const linea = (vals: (number | null)[]) => ["0,100", ...vals.flatMap((v, k) => (v === null ? [] : [`${x(k).toFixed(2)},${y(v).toFixed(2)}`]))].join(" ");
  const ptsActual = linea(filas.map((r) => r.sumaActual));
  const rotulos = diasConEtiqueta(filas.length);
  const mover = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setElegido(Math.min(filas.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * filas.length))));
  };
  const diferencia = f.sumaActual !== null && f.sumaAnterior ? (f.sumaActual - f.sumaAnterior) / f.sumaAnterior : null;

  return (
    <figure className="curva">
      <p className="barras-v-detalle curva-detalle" aria-live="polite">
        <span>{f.detalle} · {f.sumaActual === null ? "aún sin venta" : pesos(f.sumaActual)}</span>
        {f.sumaAnterior !== null && (
          <span className="saldo-nota">
            {anterior}: {pesos(f.sumaAnterior)}
            {diferencia !== null && <span className="curva-cambio" data-direccion={diferencia >= 0 ? "sube" : "baja"}>
              {diferencia >= 0 ? "+" : "−"}{Math.abs(diferencia * 100).toFixed(1)} %</span>}
          </span>
        )}
      </p>
      <div className="curva-marco">
        <div className="curva-ejes" aria-hidden="true">
          {[tope, tope / 2, 0].map((t) => <span key={t} style={{ top: `${y(t)}%` }}>{pesosCortos(t)}</span>)}
        </div>
        <div className="curva-lienzo" role="group" tabIndex={0}
          aria-label={`${titulo}. Usa las flechas para recorrer; la tabla tiene las cifras.`}
          onPointerMove={mover} onPointerLeave={() => setElegido(null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            setElegido(Math.min(filas.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1))));
          }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[0, 50, 100].map((g) => <line key={g} className="curva-guia" x1="0" x2="100" y1={g} y2={g} vectorEffect="non-scaling-stroke" />)}
            {anterior && <polyline className="curva-anterior" points={linea(filas.map((r) => r.sumaAnterior))} vectorEffect="non-scaling-stroke" />}
            <polygon className="curva-area" points={`${ptsActual} ${x(ultimo).toFixed(2)},100`} />
            <polyline className="curva-actual" points={ptsActual} vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="curva-cruz" style={{ left: `${x(i)}%` }} aria-hidden="true" />
          {f.sumaAnterior !== null && <span className="curva-punto curva-punto-anterior" style={{ left: `${x(i)}%`, top: `${y(f.sumaAnterior)}%` }} aria-hidden="true" />}
          {f.sumaActual !== null && <span className="curva-punto" style={{ left: `${x(i)}%`, top: `${y(f.sumaActual)}%` }} aria-hidden="true" />}
        </div>
        <div className="curva-rotulos" aria-hidden="true">
          {filas.map((r, k) => <span key={r.clave}>{rotulos[k] ? r.rotulo : ""}</span>)}
        </div>
      </div>
      <figcaption className="curva-leyenda">
        <span><span className="curva-muestra" aria-hidden="true" />{actual}</span>
        {anterior && <span><span className="curva-muestra curva-muestra-anterior" aria-hidden="true" />{anterior}</span>}
      </figcaption>
      <details className="curva-tabla">
        <summary>Ver como tabla</summary>
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lector">{titulo}</caption>
            <thead><tr><th scope="col">Paso</th><th scope="col">Venta</th><th scope="col">Acumulado</th>{anterior && <th scope="col">{anterior}</th>}</tr></thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.clave}>
                  <td>{r.detalle}</td>
                  <td className="monto">{r.actual === null ? "—" : pesos(r.actual)}</td>
                  <td className="monto">{r.sumaActual === null ? "—" : pesos(r.sumaActual)}</td>
                  {anterior && <td className="monto">{r.sumaAnterior === null ? "—" : pesos(r.sumaAnterior)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
