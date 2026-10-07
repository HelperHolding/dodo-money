import type { Hoja } from "../ventas/xlsx";

export type DiaMerma = { sucursal_id: string; fecha: string; productos_completos?: boolean };
export type MermaDodo = DiaMerma & { tipo: "insumo" | "producto"; clave: string; nombre: string; unidad: string; categoria: string;
  cantidad: number; costo: number; sin_costo: boolean };
export type LecturaMermas = { dias: DiaMerma[]; filas: MermaDodo[]; errores: string[] };
const normal = (v: unknown) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const texto = (v: unknown) => String(v ?? "").trim();
const pesos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fechaReal = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const fechaDMY = (v: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v); const f = m ? `${m[3]}-${m[2]}-${m[1]}` : ""; return fechaReal(f) ? f : ""; };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const RAZONES = ["fecha de caducidad pasada", "deterioro del producto", "embalaje danado", "factor humano", "marketing", "fecha de caducidad pasada de escaparate", "deterioro de productos por escaparates"];
function filasHoja(hoja: Hoja) {
  const filas = new Map<number, Map<string, string | number>>();
  for (const [ref, valor] of hoja.celdas) { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) continue; const n = Number(m[2]); if (!filas.has(n)) filas.set(n, new Map()); filas.get(n)!.set(m[1], valor); }
  return [...filas].sort((a, b) => a[0] - b[0]);
}
const indiceColumna = (v: string) => [...v].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const numero = (v: unknown): number => typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;

/** Exportación española de Bajas: todas las razones, por días y sin IVA. Los productos terminados se valoran aparte para el P&L. */
export function leerMermasDodo(hojas: readonly Hoja[], sucursales: readonly { id: string; nombre: string }[], hoy: string): LecturaMermas {
  const filas: MermaDodo[] = [], dias = new Map<string, DiaMerma>(), errores: string[] = [], porSucursal = new Map(sucursales.map((s) => [normal(s.nombre), s.id]));
  const coberturaProductos = new Set<string>();
  const claves = new Set<string>(), hojasProducto = new Set<string>(); let materiales = 0;
  for (const hoja of hojas) {
    const tabla = filasHoja(hoja);
    const cabecera = tabla.find(([, r]) => normal(r.get("A")) === "id" && normal(r.get("B")) === "suministros");
    const producto = tabla.find(([, r]) => normal(r.get("A")) === "nombre" && normal(r.get("B")) === "fecha" && normal(r.get("D")).includes("cogs"));
    if (!cabecera && !producto) { errores.push(`La hoja "${hoja.nombre}" no es parte del reporte de Bajas de Dodo IS en español.`); continue; }
    const meta = (clave: string) => { const r = tabla.find(([, r]) => normal(r.get("A")).replace(/:$/, "") === clave)?.[1]; return r ? texto([...r].filter(([c]) => c !== "A").find(([, v]) => texto(v))?.[1]) : ""; };
    const nombreSucursal = meta("unidad/tienda"), sucursal_id = porSucursal.get(normal(nombreSucursal));
    if (!sucursal_id || sucursales.filter(s=>normal(s.nombre)===normal(nombreSucursal)).length!==1) { errores.push(`La sucursal "${nombreSucursal}" no está registrada con un nombre único en la app.`); continue; }
    const fechas = meta("periodo").match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
    const desde = fechaDMY(fechas[0] ?? ""), hasta = fechaDMY(fechas[1] ?? "");
    if (!desde || !hasta || desde > hasta || hasta > hoy || (Date.parse(hasta) - Date.parse(desde)) / 86400000 > 365) { errores.push(`Revisa el periodo de "${hoja.nombre}": debe ser válido, sin fechas futuras y de hasta 366 días.`); continue; }
    const razones = normal(meta("motivo de la deduccion")).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (razones.length !== RAZONES.length || !RAZONES.every((r) => razones.includes(r))) { errores.push(`Exporta todas las razones de baja de "${hoja.nombre}" para poder reemplazar días completos.`); continue; }
    const fechasPeriodo: string[] = [];
    for (let f = desde; f <= hasta; f = new Date(Date.parse(`${f}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) fechasPeriodo.push(f);
    if (cabecera) {
      materiales++;
      const [nCabecera, cab] = cabecera;
      if (normal(meta("tipo de informe")) !== "por fechas" || normal(cab.get("E")) !== "precio (sin iva)" || normal(cab.get("F")) !== "costar (sin iva)") { errores.push(`Exporta "${hoja.nombre}" por días y sin IVA.`); continue; }
      const columnas = [...cab].filter(([c, v]) => indiceColumna(c) >= 7 && texto(v)).sort((a, b) => indiceColumna(a[0]) - indiceColumna(b[0]));
      if (columnas.length !== fechasPeriodo.length || columnas.some(([, v], i) => normal(v) !== `${Number(fechasPeriodo[i].slice(8))} de ${MESES[Number(fechasPeriodo[i].slice(5, 7)) - 1]}`)) { errores.push(`Los días de "${hoja.nombre}" no coinciden con el periodo.`); continue; }
      for (const fecha of fechasPeriodo) { const k = `${sucursal_id}|${fecha}`; if (dias.has(k)) errores.push(`La sucursal y el día ${fecha} están repetidos en el archivo.`); dias.set(k, { sucursal_id, fecha }); }
      let categoria = "";
      for (const [n, r] of tabla.filter(([n]) => n > nCabecera)) {
        if (!texto(r.get("A"))) { if (texto(r.get("B"))) categoria = texto(r.get("B")); continue; }
        const id = numero(r.get("A")), cantidad = numero(r.get("D")), precio = numero(r.get("E")), costo = numero(r.get("F"));
        const cantidades = columnas.map(([c]) => numero(r.get(c) ?? 0));
        if (!Number.isSafeInteger(id) || id < 1 || !texto(r.get("B")) || !texto(r.get("C")) || ![cantidad, precio, costo, ...cantidades].every((v) => Number.isFinite(v) && v >= 0)
          || Math.abs(cantidades.reduce((s, v) => s + v, 0) - cantidad) > 0.0011 || (cantidad === 0 && costo > 0)) { errores.push(`Revisa cantidades y costos en "${hoja.nombre}", fila ${n}.`); continue; }
        const clave = `${sucursal_id}|${id}`;
        if (claves.has(clave)) { errores.push(`Insumo ${id} repetido en "${hoja.nombre}".`); continue; } claves.add(clave);
        // El Excel contiene un costo para todo el periodo: se reparte según las cantidades diarias, conservando centavos.
        const positivos = cantidades.map((q, i) => ({ q, fecha: fechasPeriodo[i] })).filter((d) => d.q > 0); let asignado = 0;
        positivos.forEach((d, i) => { const importe = i === positivos.length - 1 ? pesos(costo - asignado) : Math.min(pesos(costo - asignado), pesos(costo * d.q / cantidad)); asignado = pesos(asignado + importe);
          filas.push({ sucursal_id, fecha: d.fecha, tipo: "insumo", clave: String(id), nombre: texto(r.get("B")), unidad: texto(r.get("C")), categoria, cantidad: d.q, costo: importe, sin_costo: precio === 0 || costo === 0 }); });
      }
    } else if (producto) {
      if (hojasProducto.has(sucursal_id)) { errores.push(`Productos repetidos para la sucursal "${nombreSucursal}".`); continue; }
      hojasProducto.add(sucursal_id);
      if (normal(producto[1].get("D")) !== "cogs (sin iva)" || normal(producto[1].get("E")) !== "importe (sin iva)") { errores.push(`Exporta los productos de "${hoja.nombre}" sin IVA.`); continue; }
      for (const fecha of fechasPeriodo) coberturaProductos.add(`${sucursal_id}|${fecha}`);
      const agrupados = new Map<string, MermaDodo>();
      for (const [n, r] of tabla.filter(([n]) => n > producto[0])) {
        if (![...r.values()].some((v) => texto(v))) continue;
        const fecha = fechaDMY(texto(r.get("B"))), cantidad = numero(r.get("C")), costo = numero(r.get("E")), unitario = numero(r.get("D")), nombre = texto(r.get("A"));
        if (!fecha || fecha < desde || fecha > hasta || !nombre || ![cantidad, costo, unitario].every((v) => Number.isFinite(v) && v >= 0) || cantidad === 0) { errores.push(`Revisa "${hoja.nombre}", fila ${n}.`); continue; }
        const clave = nombre.toLowerCase(), k = `${sucursal_id}|${fecha}|${clave}`, anterior = agrupados.get(k);
        if (anterior) { anterior.cantidad += cantidad; anterior.costo += costo; anterior.sin_costo ||= unitario === 0 || costo === 0; }
        else agrupados.set(k, { sucursal_id, fecha, tipo: "producto", clave, nombre, unidad: "piezas", categoria: "Producto terminado", cantidad, costo, sin_costo: unitario === 0 || costo === 0 });
      }
      filas.push(...[...agrupados.values()].map((r) => ({ ...r, costo: pesos(r.costo) })));
    }
  }
  if (!materiales) errores.push("El archivo debe incluir la hoja de insumos del reporte de Bajas de Dodo IS.");
  for (const r of filas) if (!dias.has(`${r.sucursal_id}|${r.fecha}`)) errores.push(`El producto ${r.nombre} tiene fecha fuera de los días de insumos importados.`);
  if (filas.length > 50000) errores.push("El archivo tiene demasiados renglones; exporta un periodo más corto.");
  if (dias.size > 10000) errores.push("El archivo tiene demasiados días y sucursales; exporta un periodo más corto.");
  if (filas.some(r=>r.nombre.length>500 || r.clave.length>500 || r.unidad.length>60 || r.categoria.length>100 || r.cantidad>=1000000000 || r.costo>=1000000000000)) errores.push("El archivo contiene valores fuera de los límites de importación.");
  return errores.length ? { filas: [], dias: [], errores: [...new Set(errores)] } : { filas, dias: [...dias.values()].map(d => ({...d, productos_completos: coberturaProductos.has(`${d.sucursal_id}|${d.fecha}`)})), errores: [] };
}

export function resumirMermas(filas: readonly MermaDodo[], dias: readonly DiaMerma[]) {
  const resumen = new Map(dias.map(d=>[`${d.sucursal_id}|${d.fecha}`,{...d,insumos:0,productos:0,costoInsumos:0,costoProductos:0,sinCosto:0}]));
  for (const r of filas) { const d=resumen.get(`${r.sucursal_id}|${r.fecha}`); if(!d)continue;
    if(r.tipo==="insumo"){d.insumos++;d.costoInsumos+=r.costo;}else{d.productos+=r.cantidad;d.costoProductos+=r.costo;}
    if(r.sin_costo)d.sinCosto++;
  }
  return [...resumen.values()].map(d=>({...d,costoInsumos:pesos(d.costoInsumos),costoProductos:pesos(d.costoProductos)})).sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.sucursal_id.localeCompare(b.sucursal_id));
}
