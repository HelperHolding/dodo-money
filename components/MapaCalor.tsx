"use client";

import { useState } from "react";
import { pesos } from "@/lib/formato";
import { DIAS_SEMANA as DIAS } from "@/lib/ventas/pedidos";

type Celda = { dia: number; hora: number; total: number; pedidos: number };

/**
 * Venta por día de la semana (filas) y hora (columnas). Entre más venta, más naranja. Arriba se lee el detalle
 * de la celda elegida (al inicio, la hora pico); tocar o pasar el mouse por una celda lo cambia.
 */
export function MapaCalor({ celdas, horaMin, horaMax }: { celdas: readonly Celda[]; horaMin: number; horaMax: number }) {
  const max = Math.max(0, ...celdas.map((c) => c.total));
  const pico = celdas.find((c) => c.total === max) ?? null;
  const [elegida, setElegida] = useState<Celda | null>(pico);
  const horas = Array.from({ length: horaMax - horaMin + 1 }, (_, i) => horaMin + i);
  const celda = (dia: number, hora: number) => celdas.find((c) => c.dia === dia && c.hora === hora);
  const detalle = (c: Celda) => `${DIAS[c.dia - 1]} ${c.hora} h · ${pesos(c.total)} · ${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"}`;

  return (
    <div className="mapa-calor">
      <p className="barras-v-detalle" aria-live="polite">
        {elegida ? detalle(elegida) : "Sin ventas"}
        {elegida && elegida === pico && <span className="saldo-nota"> · hora pico</span>}
      </p>
      <div className="mapa-calor-rejilla" role="grid" aria-label="Venta por día y hora" style={{ gridTemplateColumns: `2.4em repeat(${horas.length}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" />
        {horas.map((h) => <span key={h} className="mapa-calor-hora" aria-hidden="true">{h}</span>)}
        {DIAS.map((nombre, i) => (
          <div key={nombre} role="row" style={{ display: "contents" }}>
            <span className="mapa-calor-dia" role="rowheader">{nombre}</span>
            {horas.map((h) => {
              const c = celda(i + 1, h);
              const intensidad = c && max > 0 ? Math.round(12 + (88 * c.total) / max) : 0;
              return (
                <button key={h} type="button" role="gridcell" className="mapa-calor-celda" disabled={!c}
                  aria-pressed={c !== undefined && c === elegida}
                  aria-label={c ? detalle(c) : `${nombre} ${h} h · sin ventas`}
                  style={c ? { background: `color-mix(in srgb, var(--accion) ${intensidad}%, var(--blanco))` } : undefined}
                  onClick={() => c && setElegida(c)} onMouseEnter={() => c && setElegida(c)} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
