"use client";

import { useState } from "react";
import { porcentaje } from "@/lib/formato";

/**
 * `serie` fija el color de cada concepto: el color sigue al concepto, no a su lugar en la lista. 1 a 4 son las series del
 * tablero, "base" el gris neutro (lo que se resta, como un descuento) y "bien", "mal" y "aviso" los colores de estado.
 */
export type ParteApilada = { clave: string; etiqueta: string; valor: number; detalle?: string; serie: 1 | 2 | 3 | 4 | "base" | "bien" | "mal" | "aviso" };

/**
 * Reparto al 100 % en una sola barra (separación de 2 px entre tramos) con su leyenda: concepto, importe y porcentaje
 * escritos, para que el color nunca sea la única pista. Pasar el mouse por un tramo o por su renglón resalta los dos.
 */
export function BarraApilada({ titulo, partes }: { titulo: string; partes: readonly ParteApilada[] }) {
  const [activa, setActiva] = useState<string | null>(null);
  const total = partes.reduce((n, p) => n + Math.max(0, p.valor), 0);
  const parte = (v: number) => (total > 0 ? Math.max(0, v) / total : null);
  const resaltar = (clave: string) => ({ onPointerEnter: () => setActiva(clave), onPointerLeave: () => setActiva(null) });
  const tenue = (clave: string) => (activa && activa !== clave ? "si" : undefined);
  return (
    <div className="apilada">
      <h3>{titulo}</h3>
      <div className="apilada-barra" role="img"
        aria-label={`${titulo}: ${partes.map((p) => `${p.etiqueta} ${porcentaje(parte(p.valor))}`).join(", ")}`}>
        {partes.filter((p) => p.valor > 0).map((p) => (
          <span key={p.clave} data-serie={p.serie} data-tenue={tenue(p.clave)} style={{ flexGrow: p.valor }} {...resaltar(p.clave)} />
        ))}
      </div>
      <ul className="apilada-leyenda">
        {partes.map((p) => (
          <li key={p.clave} data-tenue={tenue(p.clave)} {...resaltar(p.clave)}>
            <span className="apilada-muestra" data-serie={p.serie} aria-hidden="true" />
            <span className="apilada-etiqueta">{p.etiqueta}</span>
            {p.detalle && <span className="apilada-detalle">{p.detalle}</span>}
            <strong>{porcentaje(parte(p.valor))}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
