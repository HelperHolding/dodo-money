import type { PuntoHistorial } from "@/lib/ventas/inicio";
import { pesos } from "@/lib/formato";

/** Monto abreviado para el eje: $250k, $1.2M. */
const abreviar = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);

/**
 * Línea de venta con puntos en SVG (sin librerías). Eje de montos abreviado y redondeado hacia arriba.
 * El último punto, si el periodo sigue en curso, va hueco. Los periodos sin datos no existen: no se dibujan como cero.
 */
export function LineaHistorial({ titulo, puntos }: { titulo: string; puntos: readonly PuntoHistorial[] }) {
  if (!puntos.length) return <p className="vacio">Sin ventas importadas en este rango.</p>;
  const W = 800, H = 280, izq = 56, der = 16, arr = 12, abj = 28;
  const max = Math.max(...puntos.map((p) => p.total), 1);
  const escala = 10 ** Math.floor(Math.log10(max));
  const tope = Math.ceil(max / escala) * escala;
  const x = (i: number) => izq + (puntos.length === 1 ? (W - izq - der) / 2 : (i * (W - izq - der)) / (puntos.length - 1));
  const y = (v: number) => arr + (1 - v / tope) * (H - arr - abj);
  const guias = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope);
  const trazo = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(" ");
  const texto = (p: PuntoHistorial) => `${p.rotulo}: ${pesos(p.total)}${p.parcial ? " (en curso)" : ""}`;
  return (
    <figure className="linea-historial">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${titulo}. ${puntos.map(texto).join(", ")}`}>
        {guias.map((v) => (
          <g key={v}>
            <line className="linea-historial-guia" x1={izq} x2={W - der} y1={y(v)} y2={y(v)} />
            <text className="linea-historial-eje" x={izq - 8} y={y(v) + 4} textAnchor="end">{abreviar(v)}</text>
          </g>
        ))}
        <path className="linea-historial-trazo" d={trazo} />
        {puntos.map((p, i) => (
          <g key={p.clave}>
            <circle className="linea-historial-punto" data-parcial={p.parcial || undefined} cx={x(i)} cy={y(p.total)} r={5}><title>{texto(p)}</title></circle>
            <text className="linea-historial-eje" x={x(i)} y={H - 8} textAnchor="middle">{p.rotulo}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
