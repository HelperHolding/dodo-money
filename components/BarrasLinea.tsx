import { pesos } from "@/lib/formato";

export type PuntoBarrasLinea = { clave: string; rotulo: string; barra: number; linea: number; detalle: string };

/** Monto abreviado para el eje: $250k, $1.2M. */
const abreviar = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
/** Tope redondeado hacia arriba a una cifra “bonita”. */
const tope = (max: number) => {
  const escala = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / escala) * escala;
};

/** Barras (venta, eje izquierdo en pesos) con una línea de tickets (eje derecho) sobre los mismos periodos. */
export function BarrasLinea({ titulo, puntos }: { titulo: string; puntos: readonly PuntoBarrasLinea[] }) {
  if (!puntos.length) return <p className="vacio">Sin datos en el periodo.</p>;
  const W = 800, H = 280, izq = 56, der = 48, arr = 12, abj = 28;
  const topeBarra = tope(Math.max(1, ...puntos.map((p) => p.barra)));
  const topeLinea = tope(Math.max(1, ...puntos.map((p) => p.linea)));
  const ancho = (W - izq - der) / puntos.length;
  const cx = (i: number) => izq + ancho * (i + 0.5);
  const yB = (v: number) => arr + (1 - v / topeBarra) * (H - arr - abj);
  const yL = (v: number) => arr + (1 - v / topeLinea) * (H - arr - abj);
  const guias = [0, 0.25, 0.5, 0.75, 1];
  const trazo = puntos.map((p, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${yL(p.linea).toFixed(1)}`).join(" ");
  const texto = (p: PuntoBarrasLinea) => `${p.rotulo}: ${pesos(p.barra)}, ${p.linea} tickets${p.detalle ? ` (${p.detalle})` : ""}`;
  return (
    <figure className="bi-barras-linea">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${titulo}. ${puntos.map(texto).join(", ")}`}>
        {guias.map((f) => (
          <g key={f}>
            <line className="bi-barras-linea-guia" x1={izq} x2={W - der} y1={yB(f * topeBarra)} y2={yB(f * topeBarra)} />
            <text className="bi-barras-linea-eje" x={izq - 8} y={yB(f * topeBarra) + 4} textAnchor="end">{abreviar(f * topeBarra)}</text>
            <text className="bi-barras-linea-eje" x={W - der + 8} y={yL(f * topeLinea) + 4} textAnchor="start">{Math.round(f * topeLinea)}</text>
          </g>
        ))}
        {puntos.map((p, i) => (
          <g key={p.clave}>
            <rect className="bi-barras-linea-barra" x={cx(i) - ancho * 0.3} width={ancho * 0.6} y={yB(p.barra)} height={Math.max(0, yB(0) - yB(p.barra))}><title>{texto(p)}</title></rect>
            <text className="bi-barras-linea-eje" x={cx(i)} y={H - 8} textAnchor="middle">{p.rotulo}</text>
          </g>
        ))}
        <path className="bi-barras-linea-trazo" d={trazo} />
        {puntos.map((p, i) => (
          <circle key={p.clave} className="bi-barras-linea-punto" cx={cx(i)} cy={yL(p.linea)} r={4}><title>{texto(p)}</title></circle>
        ))}
      </svg>
    </figure>
  );
}
