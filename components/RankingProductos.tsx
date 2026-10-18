import { Icono } from "@/components/Icono";
import { pesos, porcentaje } from "@/lib/formato";

export type FilaRanking = { clave: string; nombre: string; importe: number; piezas: number; cambio: number | null };

/**
 * Productos que más vendieron como ranking: lugar, nombre, barra proporcional al más vendido, importe, piezas
 * y el cambio contra el periodo anterior (flecha y signo, no solo color). Sin dato anterior se marca "Nuevo".
 */
export function RankingProductos({ titulo, filas }: { titulo: string; filas: readonly FilaRanking[] }) {
  const max = Math.max(0, ...filas.map((f) => f.importe)) || 1;
  return (
    <ol className="ranking" aria-label={titulo}>
      {filas.map((f, i) => (
        <li key={f.clave}>
          <span className="ranking-lugar" data-podio={i < 3 ? "si" : undefined}>{i + 1}</span>
          <div className="ranking-cuerpo">
            <p className="ranking-linea"><strong>{f.nombre}</strong><span className="ranking-importe">{pesos(f.importe)}</span></p>
            <span className="ranking-barra" aria-hidden="true"><span style={{ width: `${(f.importe / max) * 100}%` }} /></span>
            <p className="ranking-linea ranking-detalle">
              <span>{f.piezas.toLocaleString("es-MX")} pzs</span>
              {f.cambio === null
                ? <span className="insignia" data-tono="info">Nuevo</span>
                : <span className="ranking-cambio" data-sentido={f.cambio > 0 ? "sube" : f.cambio < 0 ? "baja" : "igual"}>
                    <Icono nombre={f.cambio > 0 ? "sube" : f.cambio < 0 ? "baja" : "igual"} etiqueta={f.cambio > 0 ? "Sube" : f.cambio < 0 ? "Baja" : "Sin cambio"} />
                    {porcentaje(Math.abs(f.cambio))}
                  </span>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
