/** `parte` es la porción de `valor` que se pinta al inicio con el segundo color. */
export type Barra = { clave: string; etiqueta: string; valor: number; texto: string; alerta?: boolean; parte?: number };

/**
 * Barras horizontales en SVG: una fila por dato con su etiqueta y su valor escritos, para que se lea en celular
 * sin tablas anchas. La barra más larga es el valor más alto.
 */
export function Grafica({ titulo, barras }: { titulo: string; barras: readonly Barra[] }) {
  const max = Math.max(0, ...barras.map((b) => b.valor));
  return (
    <ul className="grafica" aria-label={titulo}>
      {barras.map((b) => (
        <li key={b.clave} className="grafica-fila">
          <span className="grafica-etiqueta">{b.etiqueta}</span>
          <svg className="grafica-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
            <rect className="grafica-fondo" x="0" y="0" width="100" height="10" />
            <rect className={b.alerta ? "grafica-rect grafica-rect-alerta" : "grafica-rect"} x="0" y="0"
              width={max > 0 ? Math.max(0, (b.valor / max) * 100) : 0} height="10" />
            {b.parte ? <rect className="grafica-rect-parte" x="0" y="0" width={max > 0 ? Math.max(0, (Math.min(b.parte, b.valor) / max) * 100) : 0} height="10" /> : null}
          </svg>
          <span className="grafica-valor">{b.texto}</span>
        </li>
      ))}
    </ul>
  );
}
