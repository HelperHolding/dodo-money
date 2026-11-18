/** Tramos del arco como fracción del máximo y color (tokens de marca). */
const TRAMOS = [
  { desde: 0, hasta: 0.6, clase: "bi-medidor-tramo-bajo" },
  { desde: 0.6, hasta: 0.9, clase: "bi-medidor-tramo-medio" },
  { desde: 0.9, hasta: 1, clase: "bi-medidor-tramo-alto" },
] as const;

const CX = 100, CY = 100, R = 80;
const punto = (f: number) => {
  const ang = Math.PI * (1 - f);
  return `${(CX + R * Math.cos(ang)).toFixed(2)} ${(CY - R * Math.sin(ang)).toFixed(2)}`;
};

/**
 * Medidor de media vuelta en SVG: arco 0…máximo en tres tramos y una aguja en min(valor, máximo).
 * Sin valor pinta «Sin dato». Sin estado: sirve en componentes de servidor.
 */
export function MedidorSemicircular({ titulo, valor, maximo, etiqueta }: { titulo: string; valor: number | null; maximo: number; etiqueta: string }) {
  const fraccion = valor === null || !(maximo > 0) ? 0 : Math.min(1, Math.max(0, valor / maximo));
  return (
    <figure className="bi-medidor">
      <svg viewBox="0 0 200 120" role="img" aria-label={`${titulo}: ${valor === null ? "Sin dato" : etiqueta}`}>
        {TRAMOS.map((t) => (
          <path key={t.clase} className={`bi-medidor-tramo ${t.clase}`} d={`M${punto(t.desde)} A${R} ${R} 0 0 1 ${punto(t.hasta)}`} />
        ))}
        {valor !== null && (
          <g className="bi-medidor-aguja" style={{ transform: `rotate(${-90 + 180 * fraccion}deg)` }}>
            <line x1={CX} y1={CY} x2={CX} y2={CY - R + 8} />
            <circle cx={CX} cy={CY} r={5} />
          </g>
        )}
        <text className="bi-medidor-valor" x={CX} y={CY + 16} textAnchor="middle">{valor === null ? "Sin dato" : etiqueta}</text>
      </svg>
      <figcaption className="bi-medidor-titulo">{titulo}</figcaption>
    </figure>
  );
}
