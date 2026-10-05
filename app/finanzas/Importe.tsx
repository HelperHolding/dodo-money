import { cifraContable } from "@/lib/finanzas/secciones";

/** Monto contable: el $ a la izquierda de la celda y la cifra a la derecha; negativos entre paréntesis. */
export function Importe({ n }: { n: number | null }) {
  if (n === null) return <>Sin dato</>;
  return <span className="importe"><span aria-hidden="true">$</span><span>{cifraContable(n)}</span></span>;
}
