import type { Rol } from "./tipos";

export const SOLO_CONSULTA = "Corporativo solo puede consultar.";

/** Cómo se muestra cada puesto. Operación es el puesto base: cocina y caja, sin abrir turno. */
export const NOMBRE_ROL: Record<Rol, string> = {
  operacion: "Operación", encargado: "Encargado", gerente: "Gerente", admin: "Administrador", corporativo: "Corporativo",
};

/** Un usuario desactivado (baja) no entra a la app; la base de datos ya le rechaza todo. */
export const puedeEntrar = (perfil: { activo: boolean }) => perfil.activo;

export const esCorporativo = (rol: Rol) => rol === "corporativo";
export const puedeAbrirTurno = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";
/** Recorrido de supervisor y cierre de mermas. */
export const puedeSupervisar = puedeAbrirTurno;
export const puedeGestionar = (rol: Rol) => rol === "gerente" || rol === "admin";

/** Reportes de ventas importadas de Dodo IS. Encargado y operación no ven ventas. */
export const puedeVerVentas = (rol: Rol) => rol === "gerente" || rol === "admin" || rol === "corporativo";
/** Ventas de todas las sucursales (el gerente solo ve la suya). */
export const veVentasDeTodas = (rol: Rol) => rol === "admin" || rol === "corporativo";
/** Importar ventas y manejar categorías y costos. */
export const puedeImportarVentas = (rol: Rol) => rol === "admin";
/** Aviso de productos sin costo en el tablero de Ventas (para revisar datos; el gerente no lo ve). */
export const veAvisoSinCosto = (rol: Rol) => rol === "admin" || rol === "corporativo";

export type Enlace = { href: string; texto: string };

/** Compras (proveedores, órdenes, facturas, pagos): oficina central. Admin edita; corporativo consulta. */
export const puedeVerCompras = (rol: Rol) => rol === "admin" || rol === "corporativo";
export const puedeEditarCompras = (rol: Rol) => rol === "admin";
/** Confirmar lo recibido de activos fijos, servicios y otros (los consumibles se reciben en Dodo IS). */
export const puedeRecibirCompras = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";
/** Salidas de efectivo a corporativo de todas las sucursales: un admin las recoge y corporativo las recibe. */
export const puedeVerEfectivo = (rol: Rol) => rol === "admin" || rol === "corporativo";
/** Aceptar o rechazar el efectivo que llega a corporativo (la única acción que corporativo puede hacer). */
export const puedeRecibirEfectivo = esCorporativo;

/** Historial de turnos con sus arqueos, movimientos y gastos, y sus reportes para imprimir. Operación no lo ve. */
export const puedeVerTurnos = (rol: Rol) => puedeAbrirTurno(rol) || esCorporativo(rol);

const ENLACE_ARQUEO: Enlace = { href: "/arqueo", texto: "Arqueo de turno" };
const ENLACES_SUCURSAL: readonly Enlace[] = [
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/caja-chica", texto: "Caja chica" },
  { href: "/cierre", texto: "Cierre del día" },
  { href: "/checklists", texto: "Checklists" },
];

export type GrupoMenu = { titulo: string; enlaces: Enlace[] };
export type Menu = { inicio: Enlace; grupos: GrupoMenu[] };

/** Menú lateral: el mismo en toda la app, con grupos plegables. Cada puesto ve solo lo suyo. */
export function menuLateral(rol: Rol): Menu {
  const corporativo = esCorporativo(rol);
  const grupos: GrupoMenu[] = [{
    titulo: "Sucursal",
    enlaces: [
      // Corporativo entra por la vista general; el inicio de la sucursal que está viendo va dentro del grupo.
      ...(corporativo ? [{ href: "/", texto: "Inicio de sucursal" }] : []),
      ENLACE_ARQUEO,
      ...(puedeVerTurnos(rol) ? [{ href: "/turnos", texto: "Turnos" }] : []),
      ...ENLACES_SUCURSAL,
      ...(puedeRecibirCompras(rol) ? [{ href: "/recepciones", texto: "Recepciones" }] : []),
    ],
  }];
  if (puedeVerEfectivo(rol)) {
    grupos.push({ titulo: "Efectivo", enlaces: [{ href: "/efectivo", texto: "Salidas a corporativo" }] });
  }
  if (puedeVerVentas(rol)) {
    grupos.push({
      titulo: "Ventas",
      enlaces: [
        { href: "/ventas", texto: "Tablero" },
        ...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }, { href: "/ventas/costos", texto: "Costos" }] : []),
      ],
    });
  }
  if (puedeVerCompras(rol)) {
    grupos.push({
      titulo: "Compras",
      enlaces: [
        { href: "/compras", texto: "Proveedores" },
        { href: "/compras/articulos", texto: "Artículos" },
        { href: "/compras/ordenes", texto: "Órdenes" },
        { href: "/compras/recepciones", texto: "Recepciones" },
        { href: "/compras/facturas", texto: "Facturas" },
        { href: "/compras/pagos", texto: "Pagos" },
        ...(puedeEditarCompras(rol) ? [{ href: "/compras/cargar", texto: "Cargar Excel" }] : []),
      ],
    });
  }
  return {
    inicio: corporativo ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" },
    grupos,
  };
}

/** Todos los enlaces del menú, para marcar el activo. */
export const enlacesDelMenu = (menu: Menu): Enlace[] => [menu.inicio, ...menu.grupos.flatMap((g) => g.enlaces)];

/** Título del grupo que contiene la página actual (se abre solo); undefined si la página activa está fuera de los grupos. */
export function grupoAbierto(menu: Menu, ruta: string): string | undefined {
  const actual = enlaceActivo(ruta, enlacesDelMenu(menu));
  return menu.grupos.find((g) => g.enlaces.some((e) => e.href === actual))?.titulo;
}

/** El enlace activo es el de ruta más larga que contiene a la actual: en /ventas/costos se marca Costos, no Ventas. */
export function enlaceActivo(ruta: string, enlaces: readonly Enlace[]): string | undefined {
  const contiene = (href: string) => ruta === href || (href !== "/" && ruta.startsWith(`${href}/`));
  return enlaces.map((e) => e.href).filter(contiene).sort((a, b) => b.length - a.length)[0];
}
