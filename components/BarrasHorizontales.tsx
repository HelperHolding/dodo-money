export type FilaBarra = { clave: string; etiqueta: string; valor: number; detalle: string; partes?: { clave: string; valor: number }[] };

/**
 * Barras horizontales: etiqueta a la izquierda, barra proporcional al mayor y detalle a la derecha.
 * Con `partes` la barra se apila por clave y cada segmento toma su color de cat-<clave>.
 */
export function BarrasHorizontales({ titulo, filas }: { titulo: string; filas: readonly FilaBarra[] }) {
  if (!filas.length) return <p className="vacio">Sin datos en el periodo.</p>;
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul className="bi-barras-h" role="img" aria-label={`${titulo}. ${filas.map((f) => `${f.etiqueta}: ${f.detalle}`).join(", ")}`}>
      {filas.map((f) => {
        const total = f.partes ? f.partes.reduce((s, p) => s + Math.max(0, p.valor), 0) : 0;
        return (
          <li key={f.clave} className="bi-barras-h-fila">
            <span className="bi-barras-h-etiqueta">{f.etiqueta}</span>
            <span className="bi-barras-h-pista" aria-hidden="true">
              <span className="bi-barras-h-barra" style={{ width: `${(Math.max(0, f.valor) / max) * 100}%` }}>
                {f.partes
                  ? f.partes.filter((p) => p.valor > 0).map((p) => (
                      <span key={p.clave} className={`bi-barras-h-parte cat-${p.clave}`} style={{ width: `${(p.valor / (total || 1)) * 100}%` }} />
                    ))
                  : null}
              </span>
            </span>
            <span className="bi-barras-h-detalle">{f.detalle}</span>
          </li>
        );
      })}
    </ul>
  );
}
