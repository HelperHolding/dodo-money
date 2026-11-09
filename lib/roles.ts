import type { Rol } from "./tipos";
import type { NombreIcono } from "../components/Icono";

export const SOLO_CONSULTA = "Corporativo solo puede consultar.";

/** Cómo se muestra cada puesto. Operación es el puesto base: cocina y caja, sin abrir turno. */
export const NOMBRE_ROL: Record<Rol, string> = {
  operacion: "Operación", encargado: "Encargado", gerente: "Gerente", admin: "Administrador", corporativo: "Corporativo", marketing: "Marketing",
};

/** Un usuario desactivado (baja) no entra a la app; la base de datos ya le rechaza todo. */
export const puedeEntrar = (perfil: { activo: boolean }) => perfil.activo;

export const esCorporativo = (rol: Rol) => rol === "corporativo";
/** El admin elige en qué sucursal opera (cambia su sucursal activa); los demás quedan en la suya. */
export const puedeCambiarSucursal = (rol: Rol) => rol === "admin";
/** Vista general de todas las sucursales del día: admin (para elegir dónde operar) y corporativo (solo lectura). */
export const puedeVerVistaGeneral = (rol: Rol) => rol === "admin" || rol === "corporativo";
export const puedeAbrirTurno = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";
/** Recorrido de supervisor y cierre de mermas. */
export const puedeSupervisar = puedeAbrirTurno;
export const puedeGestionar = (rol: Rol) => rol === "gerente" || rol === "admin";
/** Cierre diario y corte de Rappi de su propia sucursal. */
export const puedeCerrarDia = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";

/** Reportes de ventas importadas de Dodo IS. Encargado y operación no ven ventas. */
export const puedeVerVentas = (rol: Rol) => rol === "gerente" || rol === "admin" || rol === "corporativo";
/** Ventas de todas las sucursales (el gerente solo ve la suya). */
export const veVentasDeTodas = (rol: Rol) => rol === "admin" || rol === "corporativo";
/** Importar ventas y manejar categorías y costos. */
export const puedeImportarVentas = (rol: Rol) => rol === "admin";
/** Aviso de productos sin costo en el tablero de Ventas (para revisar datos; el gerente no lo ve). */
export const veAvisoSinCosto = (rol: Rol) => rol === "admin" || rol === "corporativo";

export type Enlace = { href: string; texto: string; aliases?:readonly string[]; contador?: { n: number; urgente: boolean } };

/** Compras (proveedores, órdenes, facturas, pagos): oficina central. Admin edita; corporativo consulta. */
export const puedeVerCompras = (rol: Rol) => rol === "admin" || rol === "corporativo";
export const puedeEditarCompras = (rol: Rol) => rol === "admin";
/** P&L y nómina: admin y corporativo ven; solo admin captura. */
export const puedeVerFinanzas = (rol: Rol) => rol === "admin" || rol === "corporativo";
export const puedeEditarFinanzas = (rol: Rol) => rol === "admin";
/** Correos de marketing: marketing y admin crean y mandan campañas; corporativo consulta estadísticas. */
export const puedeVerCorreos = (rol: Rol) => rol === "marketing" || rol === "admin" || rol === "corporativo";
export const puedeEditarCorreos = (rol: Rol) => rol === "marketing" || rol === "admin";
export const esMarketing = (rol: Rol) => rol === "marketing";
/** Confirmar lo recibido de activos fijos, servicios y otros (los consumibles se reciben en Dodo IS). */
export const puedeRecibirCompras = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";
/** Salidas de efectivo a corporativo de todas las sucursales: un admin las recoge y corporativo las recibe. */
export const puedeVerEfectivo = (rol: Rol) => rol === "admin" || rol === "corporativo";
/** Aceptar o rechazar el efectivo que llega a corporativo (la única acción que corporativo puede hacer). Un admin con la bandera también. */
export const puedeRecibirEfectivo = (perfil: { rol: Rol; acepta_como_corporativo?: boolean }) =>
  esCorporativo(perfil.rol) || (perfil.rol === "admin" && perfil.acepta_como_corporativo === true);
/** Nadie recibe en corporativo lo que registró o recogió; la base de datos lo vuelve a revisar. */
export const puedeRecibirSalida = (
  perfil: { id: string; rol: Rol; acepta_como_corporativo?: boolean },
  salida: { registrado_por: string; confirmado_por: string | null },
) => puedeRecibirEfectivo(perfil) && salida.registrado_por !== perfil.id && salida.confirmado_por !== perfil.id;

/** Historial de turnos con sus arqueos, movimientos y gastos, y sus reportes para imprimir. Operación no lo ve. */
export const puedeVerTurnos = (rol: Rol) => puedeAbrirTurno(rol) || esCorporativo(rol);

const ENLACE_ARQUEO: Enlace = { href: "/arqueo", texto: "Arqueo de turno" };
const ENLACES_SUCURSAL: readonly Enlace[] = [
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/caja-chica", texto: "Gastos" },
  { href: "/cierre", texto: "Cierre del día" },
  { href: "/checklists", texto: "Checklists" },
];

export type Seccion = "General" | "Operación" | "Finanzas" | "Proyectos" | "Marca" | "Inteligencia";
export const SECCIONES: readonly Seccion[] = ["General", "Operación", "Finanzas", "Proyectos", "Marca", "Inteligencia"];
/** Área del menú: un ícono en el menú lateral y sus páginas como pestañas arriba de la página. */
export type GrupoMenu = { titulo: string; icono: NombreIcono; seccion: Seccion; enlaces: Enlace[] };
export type Menu = { inicio: Enlace; grupos: GrupoMenu[] };

/** Un área solo existe si el puesto ve al menos una de sus páginas. */
const area = (titulo: string, icono: NombreIcono, seccion: Seccion, enlaces: Enlace[]): GrupoMenu[] =>
  enlaces.length ? [{ titulo, icono, seccion, enlaces }] : [];

/** Menú lateral por áreas, en el orden de SECCIONES. Cada puesto ve solo lo suyo (mismas reglas de siempre). */
export function menuLateral(rol: Rol): Menu {
  const correos = area("Correos", "bandeja", "Marca", puedeVerCorreos(rol)
    ? [{ href: "/correos", texto: "Campañas" }, ...(puedeEditarCorreos(rol) ? [{ href: "/correos/contactos", texto: "Contactos" }] : [])] : []);
  // Marketing solo usa Correos.
  if (esMarketing(rol)) return { inicio: { href: "/correos", texto: "Campañas" }, grupos: correos };
  const corporativo = esCorporativo(rol);
  const inicio: Enlace = corporativo ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" };
  const compras = puedeVerCompras(rol), finanzas = puedeVerFinanzas(rol);
  const grupos: GrupoMenu[] = [
    // Corporativo entra por la vista general; el inicio de la sucursal que está viendo va como segunda pestaña.
    ...area(corporativo ? "Vista general" : "Inicio", "casa", "General", [
      inicio,
      ...(corporativo ? [{ href: "/", texto: "Inicio de sucursal" }] : []),
      ...(puedeCambiarSucursal(rol) ? [{ href: "/corporativo", texto: "Vista general" }] : []),
    ]),
    // Todos reciben tareas; operación solo ve las suyas, sin tablero.
    ...area("Tareas", "ok", "General", [{ href: "/tareas", texto: "Mis tareas" }, ...(rol !== "operacion" ? [{ href: "/tareas/tablero", texto: "Tablero" }] : [])]),
    ...area("Ventas", "grafica", "General", puedeVerVentas(rol) ? [
      { href: "/ventas", texto: "Tablero" },
      { href: "/ventas/rappi", texto: "Rappi" },
      { href: "/ventas/conciliacion", texto: "Conciliación" },
      ...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }] : []),
      ...(puedeImportarVentas(rol) ? [{ href: "/ventas/dodois", texto: "Dodo IS" }] : []),
      ...(["admin", "corporativo"].includes(rol) ? [{ href: "/ventas/costos", texto: "Costeo" }] : []),
    ] : []),
    ...area("Operación diaria", "tienda", "Operación", [
      ENLACE_ARQUEO,
      ...(puedeVerTurnos(rol) ? [{ href: "/turnos", texto: "Turnos" }] : []),
      ...ENLACES_SUCURSAL,
      // El admin ve las dos recepciones en una sola entrada (Compras), con pestañas En tienda / De compras.
      ...(puedeRecibirCompras(rol) && !compras ? [{ href: "/recepciones", texto: "Recepciones" }] : []),
    ]),
    ...area("Efectivo", "billete", "Operación", puedeVerEfectivo(rol) || rol === "gerente"
      ? [{ href: "/recolecciones", texto: "Recolecciones" }, ...(puedeVerEfectivo(rol) ? [{ href: "/efectivo", texto: "Salidas a corporativo" }] : [])] : []),
    ...area("Compras", "carrito", "Operación", compras ? [
      { href: "/compras", texto: "Proveedores" },
      { href: "/compras/articulos", texto: "Artículos" },
      { href: "/compras/documentos", texto: "Compras y facturas", aliases: ["/compras/ordenes", "/compras/facturas"] },
      { href: "/compras/recepciones", texto: "Recepciones", ...(puedeRecibirCompras(rol) ? { aliases: ["/recepciones"] } : {}) },
      { href: "/compras/pagos", texto: "Pagos" },
      { href: "/compras/pagos/reservas", texto: "Reservas de bóveda" },
      ...(puedeEditarCompras(rol) ? [{ href: "/compras/cargar", texto: "Cargar Excel" }] : []),
    ] : []),
    ...area("Inventario", "lista", "Operación", compras ? [{ href: "/inventario", texto: "Insumos Dodo IS" }, { href: "/inventario/uniformes", texto: "Uniformes" }] : []),
    ...area("P&L", "documento", "Finanzas", finanzas ? [
      { href: "/finanzas", texto: "P&L" },
      { href: "/finanzas/flujo", texto: "Flujo de efectivo" },
      { href: "/finanzas/mermas", texto: "Mermas Dodo IS" },
      { href: "/finanzas/parametros", texto: "Parámetros y metas" },
    ] : []),
    ...area("Banca", "banco", "Finanzas", finanzas ? [{ href: "/banca", texto: "Banca" }] : []),
    ...area("Nómina", "cartera", "Finanzas", finanzas ? [
      { href: "/finanzas/nomina", texto: "Nómina" },
      { href: "/finanzas/personal", texto: "Personal" },
      { href: "/finanzas/retenciones", texto: "Retenciones" },
    ] : []),
    ...area("Catálogos", "libro", "Finanzas", compras ? [
      { href: "/catalogos", texto: "Todos los catálogos" },
      { href: "/finanzas/catalogo", texto: "Cuentas contables" },
      { href: "/finanzas/asignacion", texto: "Asignación de cuentas" },
      { href: "/compras/razones-sociales", texto: "Razones sociales" },
    ] : []),
    ...area("Aperturas", "ubicacion", "Proyectos", compras ? [{ href: "/aperturas", texto: "Aperturas" }] : []),
    ...area("Activos", "maletin", "Proyectos", compras ? [{ href: "/activos", texto: "Activos" }] : []),
    ...area("Cumplimiento", "calendario", "Proyectos", compras ? [{ href: "/cumplimiento", texto: "Calendario de cumplimiento" }] : []),
    ...area("Usuarios y sucursales", "info", "Proyectos", rol === "admin" ? [{ href: "/administracion/usuarios", texto: "Usuarios y sucursales" }] : []),
    ...correos,
    ...area("Conocimiento", "brillo", "Inteligencia", [{ href: "/conocimiento", texto: "Manuales y Q&A" }, ...(puedeVerVentas(rol) ? [{ href: "/asistente", texto: "Asistente IA" }] : [])]),
  ];
  return { inicio, grupos };
}

/** Barra inferior en celular: los 3 destinos que cada puesto usa más (el 4º botón abre el menú completo). */
export function accesosRapidos(rol: Rol): Enlace[] {
  if (rol === "marketing") return [{ href: "/correos", texto: "Campañas" }, { href: "/correos/contactos", texto: "Contactos" }, { href: "/correos/nueva", texto: "Nueva" }];
  const inicio: Enlace = puedeVerVistaGeneral(rol) ? { href: "/corporativo", texto: "General" } : { href: "/", texto: "Inicio" };
  if (rol === "admin") return [inicio, { href: "/ventas", texto: "Ventas" }, { href: "/compras/documentos", texto: "Compras" }];
  if (rol === "corporativo") return [inicio, { href: "/ventas", texto: "Ventas" }, { href: "/finanzas", texto: "Finanzas" }];
  if (rol === "gerente") return [inicio, { href: "/arqueo", texto: "Arqueo" }, { href: "/ventas", texto: "Ventas" }];
  return [inicio, { href: "/arqueo", texto: "Arqueo" }, { href: "/checklists", texto: "Checklists" }];
}

/** Todos los enlaces del menú, sin repetir (Inicio va arriba y dentro de su área), para marcar el activo y buscar. */
export const enlacesDelMenu = (menu: Menu): Enlace[] =>
  [menu.inicio, ...menu.grupos.flatMap((g) => g.enlaces)].filter((e, i, todos) => todos.findIndex((x) => x.href === e.href) === i);

/** Área de la página actual (la de su pestaña más específica); undefined si la página no está en el menú. */
export function areaActiva(menu: Menu, ruta: string): GrupoMenu | undefined {
  const actual = enlaceActivo(ruta, menu.grupos.flatMap((g) => g.enlaces));
  return menu.grupos.find((g) => g.enlaces.some((e) => e.href === actual));
}
/** Título del área de la página actual (compatibilidad con buscador y pruebas). */
export const grupoAbierto = (menu: Menu, ruta: string) => areaActiva(menu, ruta)?.titulo;

/** El enlace activo es el de ruta más larga que contiene a la actual: en /ventas/costos se marca Costos, no Ventas. */
export function enlaceActivo(ruta: string, enlaces: readonly Enlace[]): string | undefined {
  const contiene = (href: string) => ruta === href || (href !== "/" && ruta.startsWith(`${href}/`));
  return enlaces.filter(e=>contiene(e.href)||e.aliases?.some(contiene)).map(e=>e.href).sort((a,b)=>b.length-a.length)[0];
}
