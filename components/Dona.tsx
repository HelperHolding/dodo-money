import { porcentaje } from "@/lib/formato";
import { rebanadasDona } from "@/lib/ventas/tablero";

export type ParteDona = { clave: string; etiqueta: string; valor: number; detalle: string };

/**
 * Dona en SVG: cada rebanada es un trazo del círculo (circunferencia 100, empieza arriba).
 * Al centro, la parte más grande; la leyenda va al lado en computadora y debajo en celular.
 * El color de cada parte sale de su clase cat-<clave> en globals.css.
 */
export function Dona({ titulo, partes }: { titulo: string; partes: readonly ParteDona[] }) {
  const rebanadas = rebanadasDona(partes);
  if (!rebanadas.length) return <p className="vacio">Sin ventas en el periodo.</p>;
  const mayor = rebanadas.reduce((a, b) => (b.fraccion > a.fraccion ? b : a));
  const etiqueta = (clave: string) => partes.find((p) => p.clave === clave)?.etiqueta ?? clave;
  return (
    <div className="dona">
      <svg className="dona-svg" viewBox="0 0 42 42" role="img" aria-label={`${titulo}: ${rebanadas.map((r) => `${etiqueta(r.clave)} ${porcentaje(r.fraccion)}`).join(", ")}`}>
        <circle cx="21" cy="21" r="15.9155" fill="none" className="dona-fondo" strokeWidth="6" />
        {rebanadas.map((r) => (
          <circle key={r.clave} cx="21" cy="21" r="15.9155" fill="none" className={`dona-rebanada cat-${r.clave}`} strokeWidth="6"
            strokeDasharray={`${r.fraccion * 100} ${100 - r.fraccion * 100}`} strokeDashoffset={25 - r.inicio * 100} />
        ))}
        <text x="21" y="21" textAnchor="middle" className="dona-centro">{Math.round(mayor.fraccion * 100)} %</text>
        <text x="21" y="26.5" textAnchor="middle" className="dona-centro-sub">{etiqueta(mayor.clave)}</text>
      </svg>
      <ul className="dona-leyenda">
        {partes.filter((p) => p.valor > 0).map((p) => (
          <li key={p.clave}>
            <span className={`dona-punto cat-${p.clave}`} aria-hidden="true" />
            <span className="dona-leyenda-nombre">{p.etiqueta}</span>
            <span className="dona-leyenda-valor">{p.detalle}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
