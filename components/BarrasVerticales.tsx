"use client";

import { useState } from "react";
import { diasConEtiqueta } from "@/lib/ventas/tablero";

export type BarraDia = { clave: string; rotulo: string; valor: number; detalle: string };

/**
 * Venta por día en barras verticales. Arriba se lee el detalle del día elegido (al inicio, el más alto);
 * tocar o pasar el mouse por una barra lo cambia, para que funcione igual en celular que en computadora.
 */
export function BarrasVerticales({ titulo, dias }: { titulo: string; dias: readonly BarraDia[] }) {
  const max = Math.max(0, ...dias.map((d) => d.valor));
  const masAlto = dias.findIndex((d) => d.valor === max);
  const [elegido, setElegido] = useState(masAlto);
  const rotulos = diasConEtiqueta(dias.length);
  const separacion = dias.length > 31 ? 1 : dias.length > 14 ? 3 : 8;
  if (!dias.length) return null;
  return (
    <div className="barras-v-contenedor">
      <p className="barras-v-detalle" aria-live="polite">{dias[elegido]?.detalle}</p>
      <div className="barras-v" role="group" aria-label={titulo} style={{ gap: separacion }}>
        {dias.map((d, i) => (
          <button key={d.clave} type="button" aria-pressed={i === elegido} aria-label={d.detalle}
            onClick={() => setElegido(i)} onMouseEnter={() => setElegido(i)}>
            <span data-max={i === masAlto ? "si" : undefined} style={{ height: `${max > 0 ? (d.valor / max) * 100 : 0}%` }} />
          </button>
        ))}
      </div>
      <div className="barras-v-rotulos" aria-hidden="true" style={{ gap: separacion }}>
        {dias.map((d, i) => <span key={d.clave}>{rotulos[i] ? d.rotulo : ""}</span>)}
      </div>
    </div>
  );
}
