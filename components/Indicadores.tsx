import { Icono } from "@/components/Icono";
import { pesosRedondos, porcentaje } from "@/lib/formato";
import type { Indicador } from "@/lib/ventas/tablero";

function valor(i: Indicador) {
  if (i.valor === null) return "—";
  if (i.clave === "pedidos") return i.valor.toLocaleString("es-MX");
  if (i.clave === "costo") return porcentaje(i.valor);
  return pesosRedondos(i.valor);
}

/** El cambio se lee por flecha y signo, no solo por color (el color dice si es bueno o malo para el negocio). */
export function Cambio({ i }: { i: Indicador }) {
  if (i.cambio === null) return <>Sin periodo anterior</>;
  const monto = i.unidad === "puntos" ? `${Math.abs(i.cambio).toFixed(1)} pts` : porcentaje(Math.abs(i.cambio));
  const sentido = i.cambio > 0 ? "sube" : i.cambio < 0 ? "baja" : "igual";
  const signo = i.cambio > 0 ? "+" : i.cambio < 0 ? "−" : "";
  return (
    <>
      <Icono nombre={sentido} etiqueta={sentido === "sube" ? "Sube" : sentido === "baja" ? "Baja" : "Sin cambio"} />
      {signo}{monto}
    </>
  );
}

/** Los números clave del tablero, cada uno con su cambio contra el periodo anterior (verde si es bueno, rojo si es malo). */
export function Indicadores({ lista, detalle, columnas }: {
  lista: readonly Indicador[]; detalle: Partial<Record<Indicador["clave"], string>>; columnas?: 3;
}) {
  return (
    <div className="indicadores-marco">
      <div className="indicadores" data-columnas={columnas}>
        {lista.map((i) => (
          <div key={i.clave} className="indicador">
            <span className="indicador-etiqueta">{i.etiqueta}</span>
            <strong className="indicador-valor">{valor(i)}</strong>
            <span className="indicador-cambio" data-favorable={i.favorable === null ? undefined : i.favorable ? "si" : "no"}
              title="Contra el periodo anterior del mismo largo">
              <Cambio i={i} />
            </span>
            {detalle[i.clave] && <span className="indicador-detalle">{detalle[i.clave]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
