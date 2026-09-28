import type { Rol } from "./tipos";

export const SOLO_CONSULTA = "Corporativo solo puede consultar.";

export const esCorporativo = (rol: Rol) => rol === "corporativo";
export const puedeAbrirTurno = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";
/** Recorrido de supervisor y cierre de mermas. */
export const puedeSupervisar = puedeAbrirTurno;
export const puedeGestionar = (rol: Rol) => rol === "gerente" || rol === "admin";

/** Reportes de ventas importadas de Dodo IS. Encargado y cajero no ven ventas. */
export const puedeVerVentas = (rol: Rol) => rol === "gerente" || rol === "admin" || rol === "corporativo";
/** Ventas de todas las sucursales (el gerente solo ve la suya). */
export const veVentasDeTodas = (rol: Rol) => rol === "admin" || rol === "corporativo";
/** Importar ventas y manejar categorías y costos. */
export const puedeImportarVentas = (rol: Rol) => rol === "admin";

export type Enlace = { href: string; texto: string };

const ENLACES_SUCURSAL: readonly Enlace[] = [
  { href: "/", texto: "Inicio" },
  { href: "/arqueo", texto: "Arqueo de turno" },
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/caja-chica", texto: "Caja chica" },
  { href: "/cierre", texto: "Cierre del día" },
  { href: "/checklists", texto: "Checklists" },
];

/** Menú de las pantallas de sucursal. */
export function enlacesSucursal(rol: Rol): Enlace[] {
  return [
    ...(esCorporativo(rol) ? [{ href: "/corporativo", texto: "Corporativo" }] : []),
    ...ENLACES_SUCURSAL,
    ...(puedeVerVentas(rol) ? [{ href: "/ventas", texto: "Ventas" }] : []),
  ];
}

/** Menú de Ventas (y de la vista general de corporativo). */
export function enlacesVentas(rol: Rol): Enlace[] {
  return [
    esCorporativo(rol) ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" },
    { href: "/ventas", texto: "Ventas" },
    ...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }, { href: "/ventas/costos", texto: "Costos" }] : []),
  ];
}

/** El enlace activo es el de ruta más larga que contiene a la actual: en /ventas/costos se marca Costos, no Ventas. */
export function enlaceActivo(ruta: string, enlaces: readonly Enlace[]): string | undefined {
  const contiene = (href: string) => ruta === href || (href !== "/" && ruta.startsWith(`${href}/`));
  return enlaces.map((e) => e.href).filter(contiene).sort((a, b) => b.length - a.length)[0];
}
