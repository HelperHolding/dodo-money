/**
 * Reparte un total (oficina central) entre sucursales en proporción a su venta neta.
 * Sin ventas no reparte (todo en 0: queda solo en el consolidado). Los centavos que sobran van a la de más venta.
 */
export function prorratear(total: number, ventas: ReadonlyMap<string, number>): Map<string, number> {
  const suma = [...ventas.values()].reduce((s, v) => s + Math.max(0, v), 0);
  const r = new Map<string, number>();
  if (suma <= 0) { for (const k of ventas.keys()) r.set(k, 0); return r; }
  let asignado = 0, mayor: string | null = null;
  for (const [k, v] of ventas) {
    const parte = Math.floor((total * Math.max(0, v) / suma) * 100) / 100;
    r.set(k, parte);
    asignado += parte;
    if (mayor === null || v > (ventas.get(mayor) ?? 0)) mayor = k;
  }
  const resto = Math.round((total - asignado) * 100) / 100;
  if (mayor !== null && resto) r.set(mayor, Math.round((r.get(mayor)! + resto) * 100) / 100);
  return r;
}
