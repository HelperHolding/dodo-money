/**
 * Anillo "X de Y": el porcentaje va escrito al centro y el número completo en la etiqueta accesible.
 * `alerta` lo pinta en rojo cuando hay registros fuera de norma.
 */
export function AnilloAvance({ hechas, total, tamano = 56, alerta = false, etiqueta }: {
  hechas: number; total: number; tamano?: number; alerta?: boolean; etiqueta: string;
}) {
  const pct = total ? Math.min(100, Math.round((hechas / total) * 100)) : 0;
  const r = 15.9155; // circunferencia 100: el trazo se mide directo en porcentaje
  return (
    <span className="anillo" data-alerta={alerta ? "si" : undefined} data-completo={pct === 100 ? "si" : undefined}
      style={{ width: tamano, height: tamano }} role="meter" aria-label={etiqueta}
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas} aria-valuetext={`${hechas} de ${total}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="anillo-fondo" cx="18" cy="18" r={r} />
        <circle className="anillo-trazo" cx="18" cy="18" r={r} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset="25" />
      </svg>
      <span className="anillo-pct">{pct}%</span>
    </span>
  );
}
