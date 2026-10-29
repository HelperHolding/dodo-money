import Link from "next/link";
import type { Alertas } from "@/lib/cumplimiento";

/** Contadores que no se deben perder de vista; cada uno abre el calendario con su filtro. Sin pendientes no se muestra. */
export function FranjaAlertas({ alertas }: { alertas: Alertas }) {
  const partes = [
    { n: alertas.vencidas, texto: "vencidas", estado: "vencida", tono: "peligro" },
    { n: alertas.porVencer, texto: "por vencer", estado: "por_vencer", tono: "aviso" },
    { n: alertas.sinFactura, texto: "cumplidas sin factura", estado: "cumplida_sin_factura", tono: "aviso" },
    { n: alertas.sinEvidencia, texto: "sin evidencia", estado: "sin_evidencia", tono: "aviso" },
  ].filter((p) => p.n > 0);
  if (!partes.length) return null;
  return <section className="seccion" aria-label="Alertas de cumplimiento"><h2>Cumplimiento</h2>
    <div className="acciones">{partes.map((p) => <Link key={p.estado} className="insignia" data-tono={p.tono} href={`/cumplimiento?estado=${p.estado}`}>{p.n} {p.texto}</Link>)}</div>
  </section>;
}
