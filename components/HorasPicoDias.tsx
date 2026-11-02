"use client";

import { useState } from "react";
import { ConInfo } from "@/components/ConInfo";
import { fechaTexto, pesos } from "@/lib/formato";
import type { HoraVenta } from "@/lib/ventas/graficasReporte";

/**
 * Horas pico por día en el tablero: una rejilla compacta (días × horas) en lugar de una gráfica por día.
 * Entre más venta en la hora, más naranja. Arriba se lee el detalle de la celda elegida (al inicio, la hora más alta
 * del periodo) y el resumen de su día; tocar o pasar el mouse por una celda lo cambia. Mismos datos y textos que el
 * reporte imprimible (GraficasReporteVentas), que conserva sus gráficas por día.
 */
export function HorasPicoDias({ horas, totalPeriodo, sinHora }: { horas: readonly HoraVenta[]; totalPeriodo: number; sinHora: number }) {
  const dias = [...new Set(horas.map((h) => h.fecha))];
  const max = Math.max(0, ...horas.map((h) => h.total));
  const masAlta = horas.find((h) => h.total === max) ?? null;
  const [elegida, setElegida] = useState<HoraVenta | null>(masAlta);
  const detalleTotal = horas.reduce((n, h) => n + Math.round(h.total * 100), 0) / 100;
  // Solo las horas con algún pedido en el periodo, para que la rejilla no se llene de columnas vacías
  const conVenta = horas.map((h) => h.hora);
  const desde = conVenta.length ? Math.min(...conVenta) : 0, hasta = conVenta.length ? Math.max(...conVenta) : 23;
  const columnas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const hh = (n: number) => String(n).padStart(2, "0");
  const detalleHora = (h: HoraVenta) => `${hh(h.hora)}:00–${hh(h.hora)}:59 · ${pesos(h.total)} · ${h.pedidos} pedidos registrados`;
  const resumenDia = (dia: string) => {
    const filas = horas.filter((h) => h.fecha === dia), pico = filas.reduce((a, b) => (b.total > a.total ? b : a));
    const total = filas.reduce((n, h) => n + Math.round(h.total * 100), 0) / 100;
    return `${fechaTexto(dia)} · ${pesos(total)} · Pico ${hh(pico.hora)}:00 (${pesos(pico.total)}, ${pico.pedidos} pedidos) · ${filas.reduce((n, h) => n + h.pedidos, 0)} pedidos con detalle`;
  };

  return (
    <section className="seccion horas-pico" aria-labelledby="t-horas-pico">
      <div className="seccion-cabecera">
        <h2 id="t-horas-pico">Horas pico de ventas por día</h2>
        <ConInfo titulo="Horas pico de ventas por día" etiqueta="Cómo leer esto">
          Importe vendido por hora local de México, con IVA. Cada barra incluye el número de pedidos al consultarla. Solo pedidos entregados; excluye consumo de personal. Rappi se agrega únicamente cuando está marcado para sumar por separado.
          {" "}Sin barra significa sin pedidos registrados en esa hora; no acredita cobertura completa.
        </ConInfo>
      </div>
      <p className="saldo-nota">Detalle con hora: {pesos(detalleTotal)} de {pesos(totalPeriodo)} de venta del periodo. Los totales diarios sin pedidos detallados no se distribuyen artificialmente entre horas.{sinHora > 0 ? ` ${sinHora} pedidos sin hora válida quedaron fuera de la gráfica.` : ""}</p>
      {!dias.length ? <p>No hay pedidos con hora para este periodo.</p> : (
        <>
          <span className="mapa-calor-escala" aria-hidden="true">Menos<i /><i /><i /><i />Más</span>
          <p className="barras-v-detalle horas-pico-detalle" aria-live="polite">
            {elegida ? <><span>{resumenDia(elegida.fecha)}</span><span className="saldo-nota">{detalleHora(elegida)}</span></> : "Sin ventas"}
          </p>
          <div className="horas-pico-rejilla" role="grid" aria-label="Venta por día y hora"
            style={{ gridTemplateColumns: `max-content repeat(${columnas.length}, minmax(14px, 1fr))` }}>
            <span aria-hidden="true" />
            {columnas.map((h) => <span key={h} className="mapa-calor-hora" aria-hidden="true">{hh(h)}</span>)}
            {dias.map((dia) => (
              <div key={dia} role="row" style={{ display: "contents" }}>
                <span className="mapa-calor-dia" role="rowheader">{fechaTexto(dia)}</span>
                {columnas.map((hora) => {
                  const c = horas.find((x) => x.fecha === dia && x.hora === hora);
                  const nivel = c && max > 0 ? Math.round(12 + (88 * c.total) / max) : 0;
                  return (
                    <button key={hora} type="button" role="gridcell" className="mapa-calor-celda" disabled={!c}
                      aria-pressed={c !== undefined && c === elegida}
                      aria-label={c ? `${fechaTexto(dia)} · ${detalleHora(c)}` : `${fechaTexto(dia)} · ${hh(hora)}:00 · sin pedidos registrados`}
                      style={c ? { background: `color-mix(in srgb, var(--accion) ${nivel}%, var(--campo))` } : undefined}
                      onClick={() => c && setElegida(c)} onMouseEnter={() => c && setElegida(c)} />
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
