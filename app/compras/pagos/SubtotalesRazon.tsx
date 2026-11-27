import Link from "next/link";
import { pesos } from "@/lib/formato";
import type { SubtotalRazon } from "@/lib/compras/subtotalRazon";
import { enlaceRazon } from "@/lib/compras/agruparProveedor";

export type FiltroRazon = { query: Record<string, string | undefined>; actual: string };

/**
 * Una tarjeta por razón social receptora con su subtotal; el total general queda en el encabezado de la sección.
 * Con `filtro`, cada tarjeta filtra la página a esa razón social (otro clic la quita).
 */
export function SubtotalesRazon({ grupos, unidad = ["factura", "facturas"], filtro }: { grupos: readonly SubtotalRazon[]; unidad?: [string, string]; filtro?: FiltroRazon }) {
  if (!grupos.length) return null;
  return (
    <dl className="subtotales-razon" aria-label="Subtotal por razón social">
      {grupos.map((g) => {
        const activa = !!filtro && !!g.rfc && g.rfc === filtro.actual;
        const filtra = !!filtro && !!g.rfc;
        // La liga va en el nombre y cubre toda la tarjeta con CSS (un <a> no puede envolver <dt>/<dd>).
        return (
          <div key={g.rfc ?? ""} className={filtra ? "subtotal-razon subtotal-razon-filtro" : "subtotal-razon"} data-alerta={g.rfc ? undefined : "si"} data-activa={activa ? "si" : undefined}>
            <dt>
              {filtra ? (
                <Link href={enlaceRazon(filtro!.query, g.rfc, filtro!.actual)} scroll={false} className="subtotal-razon-nombre subtotal-razon-enlace"
                  aria-current={activa ? "true" : undefined} title={activa ? "Quitar el filtro de razón social" : `Ver solo lo que se paga desde ${g.empresa}`}>{g.empresa}</Link>
              ) : <span className="subtotal-razon-nombre">{g.empresa}</span>}
              <small>{g.rfc ? `${g.rfc} · ` : ""}{g.cuenta} {g.cuenta === 1 ? unidad[0] : unidad[1]}{activa ? " · filtrando" : ""}</small>
            </dt>
            <dd>{pesos(g.total)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
