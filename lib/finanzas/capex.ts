// CAPEX de aperturas: catálogo, semáforo, resúmenes y sugerencias. Diseño: docs/superpowers/specs/2026-11-09-capex-aperturas-design.md
export const CATEGORIAS_CAPEX = [
  { clave: "proyecto_permisos", nombre: "Proyecto y permisos" },
  { clave: "obra_civil", nombre: "Obra civil y acabados" },
  { clave: "instalaciones", nombre: "Instalaciones (eléctrica, hidráulica, gas, HVAC)" },
  { clave: "equipo_cocina", nombre: "Equipo de cocina" },
  { clave: "camara_fria", nombre: "Cámara fría" },
  { clave: "mobiliario", nombre: "Mobiliario" },
  { clave: "tecnologia", nombre: "Tecnología y POS" },
  { clave: "senaletica", nombre: "Señalética" },
  { clave: "smallware", nombre: "Smallware" },
  { clave: "otros", nombre: "Otros" },
] as const;
export type CategoriaCapex = (typeof CATEGORIAS_CAPEX)[number]["clave"];
export const nombreCategoriaCapex = (clave: string) => CATEGORIAS_CAPEX.find((c) => c.clave === clave)?.nombre ?? clave;

export type FilaCapex = {
  proyecto_id: string; categoria: string; presupuesto: number | null; comprometido: number; facturado: number;
  pagado: number; pagado_con_iva: number; por_pagar_con_iva: number; por_ejercer: number | null; desviacion: number | null;
};

export type Semaforo = "verde" | "ambar" | "rojo" | "gris";
export const TONO_SEMAFORO: Record<Semaforo, string | undefined> = { verde: "exito", ambar: "aviso", rojo: "peligro", gris: undefined };
export const TEXTO_SEMAFORO: Record<Semaforo, string> = { verde: "En presupuesto", ambar: "Cerca del límite", rojo: "Sobre presupuesto", gris: "Sin presupuesto aprobado" };

/** verde < 90 % · ámbar 90–100 % · rojo > 100 % · gris sin presupuesto. */
export function semaforo(presupuesto: number | null, ejercido: number): Semaforo {
  if (presupuesto === null) return "gris";
  if (presupuesto === 0) return ejercido > 0 ? "rojo" : "verde";
  const p = ejercido / presupuesto;
  return p > 1 ? "rojo" : p >= 0.9 ? "ambar" : "verde";
}

const c = (n: number) => Math.round(n * 100);

export type ResumenCapex = {
  presupuesto: number | null; comprometido: number; facturado: number; ejercido: number;
  pagado_con_iva: number; por_pagar_con_iva: number; por_ejercer: number | null; porcentaje: number | null; semaforo: Semaforo;
};

export function resumir(filas: FilaCapex[]): ResumenCapex {
  const suma = (f: (x: FilaCapex) => number) => filas.reduce((a, x) => a + c(f(x)), 0) / 100;
  const presupuesto = filas.some((x) => x.presupuesto !== null) ? suma((x) => x.presupuesto ?? 0) : null;
  const comprometido = suma((x) => x.comprometido);
  const facturado = suma((x) => x.facturado);
  const ejercido = (c(comprometido) + c(facturado)) / 100;
  return {
    presupuesto, comprometido, facturado, ejercido,
    pagado_con_iva: suma((x) => x.pagado_con_iva), por_pagar_con_iva: suma((x) => x.por_pagar_con_iva),
    por_ejercer: presupuesto === null ? null : (c(presupuesto) - c(ejercido)) / 100,
    porcentaje: presupuesto ? ejercido / presupuesto : null,
    semaforo: semaforo(presupuesto, ejercido),
  };
}

const ITEM_A_CAPEX: Record<string, CategoriaCapex> = {
  equipo_cocina: "equipo_cocina", camara_fria: "camara_fria", mobiliario: "mobiliario",
  puertas: "obra_civil", zoclos: "obra_civil", pisos: "obra_civil", acabados: "obra_civil", paneles: "obra_civil", plafones: "obra_civil", sanitarios: "obra_civil",
  contactos: "instalaciones", salidas_cable: "instalaciones", baja_tension: "instalaciones", iluminacion: "instalaciones",
  senaletica_interior: "senaletica", senaletica_fachada: "senaletica",
};
export const equivalenciaItem = (categoria: string | null): CategoriaCapex => (categoria && ITEM_A_CAPEX[categoria]) || "otros";

export type RenglonCapex = { proyecto_id: string; categoria: string; monto: number; nota?: string | null };

/** Sugerencia para un documento sin asignación: reparte la base (orden o factura relacionada) al subtotal, o usa la categoría más común de sus items. */
export function sugerirAsignacion(e: { subtotal: number; proyectos: string[]; categoriasItems: (string | null)[]; base: RenglonCapex[] }): RenglonCapex[] {
  if (e.subtotal <= 0) return [];
  const base = e.base.filter((r) => e.proyectos.includes(r.proyecto_id) && r.monto > 0);
  if (base.length) {
    const total = base.reduce((a, r) => a + c(r.monto), 0);
    let resto = c(e.subtotal);
    return base.map((r, i) => {
      const m = i === base.length - 1 ? resto : Math.round((c(e.subtotal) * c(r.monto)) / total);
      resto -= m;
      return { proyecto_id: r.proyecto_id, categoria: r.categoria, monto: m / 100 };
    });
  }
  if (e.proyectos.length !== 1) return [];
  const cuenta = new Map<CategoriaCapex, number>();
  for (const x of e.categoriasItems) { const k = equivalenciaItem(x); cuenta.set(k, (cuenta.get(k) ?? 0) + 1); }
  const categoria = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "otros";
  return [{ proyecto_id: e.proyectos[0]!, categoria, monto: e.subtotal }];
}

/** Lee los renglones `proyecto_i, categoria_i, monto_i, nota_i`; omite los que no traen monto. */
export function leerRenglones(fd: FormData, filas: number): RenglonCapex[] {
  const out: RenglonCapex[] = [];
  for (let i = 0; i < filas; i++) {
    const texto = String(fd.get(`monto_${i}`) ?? "").replace(/[$,\s]/g, "");
    if (!texto) continue;
    const monto = Number(texto);
    if (!Number.isFinite(monto)) throw new Error(`El monto del renglón ${i + 1} no es un número.`);
    const nota = String(fd.get(`nota_${i}`) ?? "").trim();
    out.push({ proyecto_id: String(fd.get(`proyecto_${i}`) ?? ""), categoria: String(fd.get(`categoria_${i}`) ?? ""), monto: Math.round(monto * 100) / 100, nota: nota || null });
  }
  return out;
}

/** Asignaciones cuya apertura ya no es de la sucursal del documento (p. ej. se corrigió la sucursal después de asignar). */
export const asignacionesAjenas = (renglones: RenglonCapex[], proyectosSucursal: string[]): RenglonCapex[] =>
  renglones.filter((r) => !proyectosSucursal.includes(r.proyecto_id));
