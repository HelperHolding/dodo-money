import type { Hoja } from "../ventas/xlsx";

export type RecepcionLeida = {
  sucursal_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; cantidad: number; precio: number;
};

export const NO_ES_INCOMING = "Este archivo no parece un Incoming supplies de Dodo IS.";

/** Celdas de una hoja agrupadas por fila y columna. */
function filasDe(hoja: Hoja) {
  const filas = new Map<number, Map<string, string | number>>();
  for (const [ref, valor] of hoja.celdas) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    const n = Number(m[2]);
    if (!filas.has(n)) filas.set(n, new Map());
    filas.get(n)!.set(m[1], valor);
  }
  return filas;
}

const texto = (v: string | number | undefined) => String(v ?? "").trim();

/**
 * Una recepción por insumo y día con cantidad. `dias`: todos los días del periodo de cada sucursal
 * (al guardar se reemplazan completos, aunque ese día no haya llegado nada).
 */
export function leerIncomingSupplies(hojas: readonly Hoja[], sucursales: readonly { id: string; nombre: string }[]) {
  const porNombre = new Map(sucursales.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
  const recepciones: RecepcionLeida[] = [];
  const dias: { sucursal_id: string; fecha: string }[] = [];
  const errores: string[] = [];
  let hayTabla = false;

  for (const hoja of hojas) {
    if (hoja.nombre.trim().toLowerCase() === "all stores") continue;
    const filas = filasDe(hoja);
    const numeros = [...filas.keys()].sort((a, b) => a - b);
    const encabezado = numeros.find((n) => texto(filas.get(n)!.get("A")) === "ID" && texto(filas.get(n)!.get("B")) === "Materials");
    if (encabezado === undefined) continue;
    hayTabla = true;

    const sucursal = porNombre.get(hoja.nombre.trim().toLowerCase());
    if (!sucursal) { errores.push(`La hoja "${hoja.nombre.trim()}" no corresponde a ninguna sucursal de la app.`); continue; }

    const columnasDia: [string, string][] = [];
    for (const [columna, valor] of filas.get(encabezado)!) {
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(texto(valor));
      if (m) columnasDia.push([columna, `${m[3]}-${m[2]}-${m[1]}`]);
    }
    columnasDia.sort((a, b) => a[1].localeCompare(b[1]));
    for (const [, fecha] of columnasDia) dias.push({ sucursal_id: sucursal, fecha });

    for (const n of numeros.filter((x) => x > encabezado)) {
      const fila = filas.get(n)!;
      const id = texto(fila.get("A")).toUpperCase();
      if (!/^[0-9A-F]{32}$/.test(id)) continue;
      const precio = Number(fila.get("D") ?? 0);
      for (const [columna, fecha] of columnasDia) {
        const cantidad = Number(fila.get(columna) ?? 0);
        if (!(cantidad > 0)) continue;
        recepciones.push({
          sucursal_id: sucursal, dodo_insumo_id: id, material: texto(fila.get("B")), unidad: texto(fila.get("C")),
          fecha, cantidad, precio: Number.isFinite(precio) ? Math.round(precio * 100) / 100 : 0,
        });
      }
    }
  }
  if (!hayTabla) return { recepciones: [], dias: [], errores: [NO_ES_INCOMING] };
  return errores.length ? { recepciones: [], dias: [], errores } : { recepciones, dias, errores };
}
