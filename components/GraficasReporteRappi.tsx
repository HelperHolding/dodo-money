import estilos from "./graficasReporteRappi.module.css";

/** Pastel de la paleta Dodo para los reportes impresos. */
export const COLOR_RAPPI = { naranja: "#F9A77E", azul: "#9CC3F0", rosa: "#F2B5C8", aqua: "#9EDCD0", violeta: "#C7B6EE", linea: "#E7E2DD", tenue: "#7A6F66", texto: "#2B2622" } as const;
const redondo = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;

export type BarraReporte = { clave: string; etiqueta: string; valor: number; parte?: number; detalle: string };

/** Barras verticales con eje en pesos; `parte` (p. ej. Rappi Turbo) se pinta abajo con el segundo color. */
export function BarrasReporte({ titulo, barras, color = COLOR_RAPPI.naranja, ancho = 700, alto = 190 }: {
  titulo: string; barras: readonly BarraReporte[]; color?: string; ancho?: number; alto?: number;
}) {
  if (!barras.length) return <p className="vacio">Sin órdenes en el periodo.</p>;
  const max = Math.max(...barras.map((b) => b.valor)) || 1, paso = 10 ** Math.floor(Math.log10(max)), tope = Math.ceil(max / paso) * paso;
  const izq = ancho < 500 ? 44 : 54, h = alto - 30, w = (ancho - izq - 6) / barras.length;
  const y = (v: number) => 8 + h - (v / tope) * h;
  const cada = barras.length > 40 ? Math.ceil(barras.length / 31) : 1;
  return (
    <svg className={estilos.grafica} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo}>
      <title>{titulo}</title>
      {[0, 0.5, 1].map((k) => (
        <g key={k}><line x1={izq} x2={ancho - 4} y1={y(tope * k)} y2={y(tope * k)} stroke={COLOR_RAPPI.linea} />
          <text x={izq - 6} y={y(tope * k) + 4} textAnchor="end" className={estilos.eje}>{redondo(tope * k)}</text></g>
      ))}
      {barras.map((b, i) => {
        const x = izq + i * w + w * 0.14, bw = w * 0.72;
        return (
          <g key={b.clave}><title>{b.detalle}</title>
            <rect x={x} y={y(b.valor)} width={bw} height={Math.max(0, y(0) - y(b.valor))} rx={2.5} fill={color} />
            {b.parte ? <rect x={x} y={y(b.parte)} width={bw} height={Math.max(0, y(0) - y(b.parte))} rx={2.5} fill={COLOR_RAPPI.azul} /> : null}
            {i % cada === 0 && <text x={x + bw / 2} y={alto - 8} textAnchor="middle" className={estilos.eje}>{b.etiqueta}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Barras horizontales con nombre a la izquierda y valor a la derecha. */
export function HorizontalesReporte({ titulo, filas, ancho = 700, izq = 210, valor = 150 }: {
  titulo: string; filas: readonly { nombre: string; valor: number; texto: string; color: string }[]; ancho?: number; izq?: number; valor?: number;
}) {
  const alto = 22, max = Math.max(0, ...filas.map((f) => f.valor)) || 1, w = ancho - izq - valor;
  return (
    <svg className={estilos.grafica} viewBox={`0 0 ${ancho} ${filas.length * alto + 4}`} role="img" aria-label={titulo}>
      <title>{titulo}</title>
      {filas.map((f, i) => {
        const y = i * alto + 2, bw = Math.max(2, (f.valor / max) * w);
        return (
          <g key={f.nombre}>
            <text x={izq - 8} y={y + 15} textAnchor="end" className={estilos.etiqueta}>{f.nombre}</text>
            <rect x={izq} y={y + 3} width={bw} height={alto - 8} rx={3} fill={f.color} />
            <text x={izq + bw + 6} y={y + 15} className={estilos.valor}>{f.texto}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const Leyenda = ({ partes }: { partes: readonly [string, string][] }) => (
  <p className={estilos.leyenda}>{partes.map(([nombre, color]) => <span key={nombre}><i style={{ background: color }} />{nombre}</span>)}</p>
);
