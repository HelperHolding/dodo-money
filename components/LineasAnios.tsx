export type SerieAnio = { anio: number; valores: Record<number, number> };

/** Colores por orden de antigüedad; el año más reciente siempre va en --accion. */
const COLORES = ["var(--dato-1)", "var(--dato-2)", "var(--dato-3)", "var(--dato-4)"];

const abreviar = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);

/** Una línea por año sobre un eje común (semana o mes). Solo se trazan las claves con valor: no se inventan ceros. */
export function LineasAnios({ titulo, series, eje }: { titulo: string; series: readonly SerieAnio[]; eje: { desde: number; hasta: number; rotulo: (n: number) => string } }) {
  const ordenadas = series.filter((s) => Object.keys(s.valores).length > 0).sort((a, b) => a.anio - b.anio);
  if (!ordenadas.length) return <p className="vacio">Sin datos en el periodo.</p>;
  const W = 800, H = 280, izq = 56, der = 16, arr = 12, abj = 28;
  const reciente = ordenadas[ordenadas.length - 1].anio;
  const colorDe = (anio: number, i: number) => (anio === reciente ? "var(--accion)" : COLORES[i % COLORES.length]);
  const max = Math.max(1, ...ordenadas.flatMap((s) => Object.values(s.valores)));
  const escala = 10 ** Math.floor(Math.log10(max));
  const tope = Math.ceil(max / escala) * escala;
  const span = Math.max(1, eje.hasta - eje.desde);
  const x = (n: number) => izq + ((n - eje.desde) / span) * (W - izq - der);
  const y = (v: number) => arr + (1 - v / tope) * (H - arr - abj);
  const guias = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope);
  const paso = Math.max(1, Math.ceil((eje.hasta - eje.desde + 1) / 12));
  const marcas: number[] = [];
  for (let n = eje.desde; n <= eje.hasta; n += paso) marcas.push(n);
  const claves = (s: SerieAnio) => Object.keys(s.valores).map(Number).filter((n) => n >= eje.desde && n <= eje.hasta).sort((a, b) => a - b);
  const trazo = (s: SerieAnio) => claves(s).map((n, i) => `${i ? "L" : "M"}${x(n).toFixed(1)} ${y(s.valores[n]).toFixed(1)}`).join(" ");
  const resumen = ordenadas.map((s) => `${s.anio}: ${claves(s).map((n) => `${eje.rotulo(n)} ${Math.round(s.valores[n])}`).join(", ")}`).join(". ");
  return (
    <figure className="bi-lineas-anios">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${titulo}. ${resumen}`}>
        {guias.map((v) => (
          <g key={v}>
            <line className="bi-lineas-anios-guia" x1={izq} x2={W - der} y1={y(v)} y2={y(v)} />
            <text className="bi-lineas-anios-eje" x={izq - 8} y={y(v) + 4} textAnchor="end">{abreviar(v)}</text>
          </g>
        ))}
        {marcas.map((n) => (
          <text key={n} className="bi-lineas-anios-eje" x={x(n)} y={H - 8} textAnchor="middle">{eje.rotulo(n)}</text>
        ))}
        {ordenadas.map((s, i) => {
          const ks = claves(s);
          return (
            <g key={s.anio} style={{ color: colorDe(s.anio, i) }}>
              <path className="bi-lineas-anios-trazo" d={trazo(s)} />
              {ks.length === 1 && <circle className="bi-lineas-anios-punto" cx={x(ks[0])} cy={y(s.valores[ks[0]])} r={4} />}
            </g>
          );
        })}
      </svg>
      <ul className="bi-lineas-anios-leyenda">
        {ordenadas.map((s, i) => (
          <li key={s.anio}>
            <span className="bi-lineas-anios-muestra" aria-hidden="true" style={{ background: colorDe(s.anio, i) }} />
            {s.anio}
          </li>
        ))}
      </ul>
    </figure>
  );
}
