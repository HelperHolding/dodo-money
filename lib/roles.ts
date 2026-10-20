import type { Rol } from "./tipos";

export const SOLO_CONSULTA = "Corporativo solo puede consultar.";

/** Cómo se muestra cada puesto. Operación es el puesto base: cocina y caja, sin abrir turno. */
export const NOMBRE_ROL: Record<Rol, string> = {
  operacion: "Operación", encargado: "Encargado", gerente: "Gerente", admin: "Administrador", corporativo: "Corporativo",
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

export type Enlace = { href: string; texto: string; aliases?:readonly string[] };

/** Compras (proveedores, órdenes, facturas, pagos): oficina central. Admin edita; corporativo consulta. */
export const puedeVerCompras = (rol: Rol) => rol === "admin" || rol === "corporativo";
export const puedeEditarCompras = (rol: Rol) => rol === "admin";
/** P&L y nómina: admin y corporativo ven; solo admin captura. */
export const puedeVerFinanzas = (rol: Rol) => rol === "admin" || rol === "corporativo";
export const puedeEditarFinanzas = (rol: Rol) => rol === "admin";
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
  { href: "/caja-chica", texto: "Gastos" },
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
      ...(puedeCambiarSucursal(rol) ? [{ href: "/corporativo", texto: "Vista general" }] : []),
      ENLACE_ARQUEO,
      ...(puedeVerTurnos(rol) ? [{ href: "/turnos", texto: "Turnos" }] : []),
      ...ENLACES_SUCURSAL,
      // El admin ve las dos recepciones en una sola entrada (Compras), con pestañas En tienda / De compras.
      ...(puedeRecibirCompras(rol) && !puedeVerCompras(rol) ? [{ href: "/recepciones", texto: "Recepciones" }] : []),
    ],
  }];
  if (puedeVerEfectivo(rol)||rol==='gerente') {
    grupos.push({ titulo: "Efectivo", enlaces: [{href:'/recolecciones',texto:'Recolecciones'},...(puedeVerEfectivo(rol)?[{ href: "/efectivo", texto: "Salidas a corporativo" }]:[])] });
  }
  if (puedeVerVentas(rol)) {
    grupos.push({
      titulo: "Ventas",
      enlaces: [
        { href: "/ventas", texto: "Tablero" },
        { href: "/ventas/rappi", texto: "Rappi" },
        { href: "/ventas/conciliacion", texto: "Conciliación" },
        ...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }] : []),
        ...(["admin", "corporativo"].includes(rol) ? [{ href: "/ventas/costos", texto: "Costeo" }] : []),
      ],
    });
  }
  if (puedeVerCompras(rol)) {
    grupos.push({
      titulo: "Compras",
      enlaces: [
        { href: "/compras", texto: "Proveedores" },
        { href: "/compras/articulos", texto: "Artículos" },
        { href: "/compras/documentos", texto: "Compras y facturas", aliases:["/compras/ordenes","/compras/facturas"] },
        { href: "/compras/recepciones", texto: "Recepciones", ...(puedeRecibirCompras(rol) ? { aliases: ["/recepciones"] } : {}) },
        { href: "/compras/pagos", texto: "Pagos" },
        { href: "/compras/pagos/reservas", texto: "Reservas de bóveda" },
        ...(puedeEditarCompras(rol) ? [{ href: "/compras/cargar", texto: "Cargar Excel" }] : []),
      ],
    });
  }
  if (puedeVerFinanzas(rol)) {
    grupos.push({
      titulo: "Finanzas",
      enlaces: [
        { href: "/finanzas", texto: "P&L" },
        { href: "/finanzas/nomina", texto: "Nómina" },
        { href: "/finanzas/personal", texto: "Personal" },
        { href: "/finanzas/retenciones", texto: "Retenciones" },
        { href: "/finanzas/mermas", texto: "Mermas Dodo IS" },
        { href: "/finanzas/parametros", texto: "Parámetros y metas" },
      ],
    });
  }
  // Aperturas, Activos y Usuarios tenían un grupo cada uno con un solo enlace: van juntos.
  const proyectos: Enlace[] = [
    ...(puedeVerCompras(rol) ? [{ href: "/aperturas", texto: "Aperturas" }, { href: "/activos", texto: "Activos" }] : []),
    ...(rol === "admin" ? [{ href: "/administracion/usuarios", texto: "Usuarios y sucursales" }] : []),
  ];
  if (proyectos.length) grupos.push({ titulo: "Proyectos y admin.", enlaces: proyectos });
  grupos.push({
    titulo: "Conocimiento",
    enlaces: [{ href: "/conocimiento", texto: "Manuales y Q&A" }, ...(puedeVerVentas(rol) ? [{ href: "/asistente", texto: "Asistente IA" }] : [])],
  });
  return {
    inicio: corporativo ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" },
    grupos,
  };
}

/** Barra inferior en celular: los 3 destinos que cada puesto usa más (el 4º botón abre el menú completo). */
export function accesosRapidos(rol: Rol): Enlace[] {
  const inicio: Enlace = puedeVerVistaGeneral(rol) ? { href: "/corporativo", texto: "General" } : { href: "/", texto: "Inicio" };
  if (rol === "admin") return [inicio, { href: "/ventas", texto: "Ventas" }, { href: "/compras/documentos", texto: "Compras" }];
  if (rol === "corporativo") return [inicio, { href: "/ventas", texto: "Ventas" }, { href: "/finanzas", texto: "Finanzas" }];
  if (rol === "gerente") return [inicio, { href: "/arqueo", texto: "Arqueo" }, { href: "/ventas", texto: "Ventas" }];
  return [inicio, { href: "/arqueo", texto: "Arqueo" }, { href: "/checklists", texto: "Checklists" }];
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
  return enlaces.filter(e=>contiene(e.href)||e.aliases?.some(contiene)).map(e=>e.href).sort((a,b)=>b.length-a.length)[0];
}
