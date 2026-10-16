/**
 * Barra de avance "X de Y" (checklists del día). El número siempre va escrito; la barra solo lo refuerza.
 * `alerta` la pinta en rojo cuando hay registros fuera de norma.
 */
export function Avance({ etiqueta, hechas, total, alerta = false, compacta = false }: {
  etiqueta: string; hechas: number; total: number; alerta?: boolean; compacta?: boolean;
}) {
  const pct = total ? Math.min(100, Math.round((hechas / total) * 100)) : 0;
  return (
    <div className="avance" data-compacta={compacta ? "si" : undefined} data-alerta={alerta ? "si" : undefined}>
      {!compacta && (
        <p className="avance-texto"><span>{etiqueta}</span><strong>{hechas} de {total}</strong></p>
      )}
      <div className="avance-barra" role="meter" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas}
        aria-valuetext={`${hechas} de ${total}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {alerta && !compacta && <p className="avance-nota">Hay registros fuera de norma por revisar.</p>}
    </div>
  );
}
