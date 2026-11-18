import { pesos } from "@/lib/formato";
import type { SubtotalRazon } from "@/lib/compras/subtotalRazon";

/** Una tarjeta por razón social receptora con su subtotal; el total general queda en el encabezado de la sección. */
export function SubtotalesRazon({ grupos, unidad = ["factura", "facturas"] }: { grupos: readonly SubtotalRazon[]; unidad?: [string, string] }) {
  if (!grupos.length) return null;
  return (
    <dl className="subtotales-razon" aria-label="Subtotal por razón social">
      {grupos.map((g) => (
        <div key={g.rfc ?? ""} className="subtotal-razon" data-alerta={g.rfc ? undefined : "si"}>
          <dt>
            <span className="subtotal-razon-nombre">{g.empresa}</span>
            <small>{g.rfc ? `${g.rfc} · ` : ""}{g.cuenta} {g.cuenta === 1 ? unidad[0] : unidad[1]}</small>
          </dt>
          <dd>{pesos(g.total)}</dd>
        </div>
      ))}
    </dl>
  );
}
