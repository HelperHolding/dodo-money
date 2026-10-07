/**
 * Migas de pan y botón de regresar, armados con el menú del puesto y la dirección de la página:
 * grupo del menú › pantalla del menú › subpáginas. Así cada quien solo ve enlaces a lo que puede abrir.
 */
import type { Enlace, Menu } from "./roles";

export type Miga = { texto: string; href: string | null };

/** Pantallas que no están en el menú. ":id" es un registro. `sinRegresar`: la página trae su propio regreso. */
const PAGINAS: readonly { patron: string; texto: string; sinRegresar?: boolean }[] = [
  { patron: "/activos/nuevo", texto: "Agregar activo" },
  { patron: "/activos/:id", texto: "Ficha de activo" },
  { patron: "/aperturas/:id", texto: "Proyecto de apertura" },
  { patron: "/aperturas/:id/items/:id", texto: "Seguimiento" },
  { patron: "/compras/proveedores/nuevo", texto: "Nuevo proveedor" },
  { patron: "/compras/proveedores/:id", texto: "Proveedor" },
  { patron: "/compras/facturas/subir", texto: "Subir facturas" },
  { patron: "/compras/facturas/nueva", texto: "Agregar sin CFDI" },
  { patron: "/compras/facturas/empresa", texto: "Datos de la empresa" },
  { patron: "/compras/facturas/:id", texto: "Factura" },
  { patron: "/compras/ordenes/nueva", texto: "Nueva orden" },
  { patron: "/compras/ordenes/:id", texto: "Orden" },
  { patron: "/compras/ordenes/:id/comparar", texto: "Comparar" },
  { patron: "/compras/pagos/nuevo", texto: "Nuevo pago" },
  { patron: "/compras/pagos/programar", texto: "Programar pagos" },
  { patron: "/compras/pagos/:id", texto: "Pago" },
  { patron: "/ventas/costos/cargar", texto: "Cargar costos" },
  { patron: "/ventas/costos/materiales", texto: "Insumos y BOM" },
  { patron: "/turnos/:id", texto: "Turno", sinRegresar: true },
  { patron: "/checklists/amasado", texto: "Amasado de masa" },
  { patron: "/checklists/limpieza-profunda", texto: "Limpieza profunda" },
  { patron: "/checklists/masa", texto: "Temperatura de masa" },
  { patron: "/checklists/mermas", texto: "Mermas" },
  { patron: "/checklists/objetivos", texto: "Objetivos del turno" },
  { patron: "/checklists/recorrido", texto: "Recorrido de supervisor" },
  { patron: "/checklists/ronda", texto: "Ronda de la hora" },
  { patron: "/checklists/turno", texto: "Listas del turno" },
];

const partes = (ruta: string) => ruta.split("/").filter(Boolean);
const coincide = (patron: string, ruta: string) => {
  const p = partes(patron), r = partes(ruta);
  return p.length === r.length && p.every((s, i) => s === ":id" || s === r[i]);
};
const pagina = (ruta: string) => PAGINAS.find((p) => coincide(p.patron, ruta));

export function migas(ruta: string, menu: Menu): { migas: Miga[]; regresar: Miga | null } {
  const nada = { migas: [], regresar: null };
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  if (limpia === "/" || limpia === menu.inicio.href) return nada;

  // La pantalla del menú que contiene la página: la de dirección más larga.
  let grupo: string | null = null, enlace: Enlace | null = null;
  for (const g of menu.grupos) for (const e of g.enlaces) {
    const contiene = limpia === e.href || (e.href !== "/" && limpia.startsWith(`${e.href}/`));
    if (contiene && (!enlace || e.href.length > enlace.href.length)) { grupo = g.titulo; enlace = e; }
  }
  if (!enlace || !grupo) return nada;

  const lista: Miga[] = [{ texto: grupo, href: null }];
  if (limpia === enlace.href) return { migas: [...lista, { texto: enlace.texto, href: null }], regresar: null };
  lista.push({ texto: enlace.texto, href: enlace.href });

  // Cada tramo de la dirección después de la pantalla del menú; los que no son página se saltan.
  const segmentos = partes(limpia), base = partes(enlace.href).length;
  for (let i = base + 1; i <= segmentos.length; i++) {
    const tramo = `/${segmentos.slice(0, i).join("/")}`;
    const p = pagina(tramo);
    if (tramo === limpia) lista.push({ texto: p?.texto ?? "Detalle", href: null });
    else if (p) lista.push({ texto: p.texto, href: tramo });
  }
  const regresar = pagina(limpia)?.sinRegresar ? null : [...lista].reverse().find((m) => m.href) ?? null;
  return { migas: lista, regresar };
}
