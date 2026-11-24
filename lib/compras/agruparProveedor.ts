/** Facturas de un mismo proveedor juntas, para pagarle todo de corrido. */
export type GrupoProveedor<T> = { clave: string; proveedor: string; facturas: T[]; total: number; primeraFecha: string };

/**
 * Agrupa por proveedor (clave) y conserva cada grupo de corrido. Orden de los grupos: la primera fecha de pago del
 * proveedor (lo más urgente arriba) y luego el nombre; dentro del grupo, por fecha de pago y en el orden recibido.
 * Suma en centavos.
 */
export function agruparPorProveedor<T>(filas: readonly T[], o: {
  clave: (f: T) => string; nombre: (f: T) => string; monto: (f: T) => number; fecha: (f: T) => string;
}): GrupoProveedor<T>[] {
  const grupos = new Map<string, { proveedor: string; filas: { f: T; i: number }[]; centavos: number }>();
  filas.forEach((f, i) => {
    const k = o.clave(f) || o.nombre(f);
    const g = grupos.get(k) ?? { proveedor: o.nombre(f), filas: [], centavos: 0 };
    g.filas.push({ f, i });
    g.centavos += Math.round(Number(o.monto(f)) * 100);
    grupos.set(k, g);
  });
  return [...grupos.entries()]
    .map(([clave, g]) => {
      const ordenadas = [...g.filas].sort((a, b) => o.fecha(a.f).localeCompare(o.fecha(b.f)) || a.i - b.i).map((x) => x.f);
      return { clave, proveedor: g.proveedor, facturas: ordenadas, total: g.centavos / 100, primeraFecha: o.fecha(ordenadas[0]) };
    })
    .sort((a, b) => a.primeraFecha.localeCompare(b.primeraFecha) || a.proveedor.localeCompare(b.proveedor, "es"));
}

/** Liga de una tarjeta de razón social: la elige como filtro o, si ya estaba elegida, la quita. Conserva los demás filtros. */
export function enlaceRazon(query: Readonly<Record<string, string | undefined>>, rfc: string | null, actual: string): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v && k !== "empresa") q.set(k, v);
  if (rfc && rfc !== actual) q.set("empresa", rfc);
  const s = q.toString();
  return s ? `?${s}` : "?";
}
