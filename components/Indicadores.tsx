import { pesosRedondos, porcentaje } from "@/lib/formato";
import type { Indicador } from "@/lib/ventas/tablero";

function valor(i: Indicador) {
  if (i.valor === null) return "—";
  if (i.clave === "pedidos") return i.valor.toLocaleString("es-MX");
  if (i.clave === "costo") return porcentaje(i.valor);
  return pesosRedondos(i.valor);
}

function cambio(i: Indicador) {
  if (i.cambio === null) return "Sin periodo anterior";
  const flecha = i.cambio > 0 ? "▲" : i.cambio < 0 ? "▼" : "=";
  const monto = i.unidad === "puntos" ? `${Math.abs(i.cambio).toFixed(1)} pts` : porcentaje(Math.abs(i.cambio));
  return `${flecha} ${monto}`;
}

/** Los números clave del tablero, cada uno con su cambio contra el periodo anterior (verde si es bueno, rojo si es malo). */
export function Indicadores({ lista, detalle }: { lista: readonly Indicador[]; detalle: Partial<Record<Indicador["clave"], string>> }) {
  return (
    <div className="indicadores">
      {lista.map((i) => (
        <div key={i.clave} className="indicador">
          <span className="indicador-etiqueta">{i.etiqueta}</span>
          <strong className="indicador-valor">{valor(i)}</strong>
          <span className="indicador-cambio" data-favorable={i.favorable === null ? undefined : i.favorable ? "si" : "no"}
            title="Contra el periodo anterior del mismo largo">
            {cambio(i)}
          </span>
          {detalle[i.clave] && <span className="indicador-detalle">{detalle[i.clave]}</span>}
        </div>
      ))}
    </div>
  );
}
