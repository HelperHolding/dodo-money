export const BILLETES = [1000, 500, 200, 100, 50, 20] as const;
export const MONEDAS = [20, 10, 5, 2, 1, 0.5] as const;

export const claveBillete = (d: number) => `b${d}`;
export const claveMoneda = (d: number) => `m${String(d).replace(".", "_")}`;

export function totalConteo(conteo: Record<string, number>): number {
  let total = 0;
  for (const d of BILLETES) total += (conteo[claveBillete(d)] ?? 0) * d;
  for (const d of MONEDAS) total += (conteo[claveMoneda(d)] ?? 0) * d;
  return Math.round(total * 100) / 100;
}
