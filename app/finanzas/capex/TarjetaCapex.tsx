import Link from "next/link";
import { pesos } from "@/lib/formato";
import { TEXTO_SEMAFORO, TONO_SEMAFORO, type ResumenCapex } from "@/lib/finanzas/capex";

/** Tarjeta de una apertura o categoría: cifras, barra facturado · comprometido · disponible y semáforo. */
export function TarjetaCapex({ titulo, href, detalle, r }: { titulo: string; href?: string; detalle?: React.ReactNode; r: ResumenCapex }) {
  const base = Math.max(r.presupuesto ?? 0, r.ejercido, 0.01);
  const ancho = (n: number) => `${Math.max(0, (n / base) * 100)}%`;
  const disponible = Math.max(0, (r.presupuesto ?? 0) - r.ejercido);
  return (
    <article className="saldo" data-tono={r.semaforo === "rojo" ? undefined : r.semaforo === "ambar" ? "ambar" : r.semaforo === "verde" ? "cuadra" : undefined} data-alerta={r.semaforo === "rojo" ? "" : undefined}>
      <span>{href ? <Link href={href}>{titulo}</Link> : titulo}</span>
      <span className="insignia" data-tono={TONO_SEMAFORO[r.semaforo]}>{TEXTO_SEMAFORO[r.semaforo]}{r.porcentaje !== null && ` · ${(r.porcentaje * 100).toFixed(1)} %`}</span>
      <span className="saldo-monto">{pesos(r.ejercido)}</span>
      <small className="saldo-nota">Ejercido sin IVA{r.presupuesto !== null && ` de ${pesos(r.presupuesto)}`}</small>
      <div className="barra-apilada" aria-hidden="true">
        <div style={{ background: "var(--info)", width: ancho(r.facturado) }} />
        <div style={{ background: "var(--ambar)", width: ancho(r.comprometido) }} />
        <div style={{ background: "var(--cuadra)", width: ancho(disponible) }} />
      </div>
      <dl className="saldo-nota">
        <div><dt>Facturado</dt><dd>{pesos(r.facturado)}</dd></div>
        <div><dt>Comprometido</dt><dd>{pesos(r.comprometido)}</dd></div>
        {r.por_ejercer !== null && <div><dt>Por ejercer</dt><dd>{pesos(r.por_ejercer)}</dd></div>}
        <div><dt>Pagado con IVA</dt><dd>{pesos(r.pagado_con_iva)}</dd></div>
        <div><dt>Por pagar con IVA</dt><dd>{pesos(r.por_pagar_con_iva)}</dd></div>
      </dl>
      {detalle}
    </article>
  );
}
