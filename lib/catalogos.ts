import type { Rol } from './tipos';

type Catalogo={nombre:string;href:string;descripcion:string;gestion:string;soloAdmin?:boolean};
const CATALOGOS:readonly Catalogo[]=[
  {nombre:'Proveedores',href:'/compras',descripcion:'Datos fiscales, contactos, documentos y condiciones de pago.',gestion:'Alta y edición'},
  {nombre:'Artículos de compra',href:'/compras/articulos',descripcion:'Nombre, unidad, IVA, proveedores y relación con insumos de Dodo IS.',gestion:'Alta y edición'},
  {nombre:'Productos y costeo',href:'/ventas/costos',descripcion:'Productos de venta, categorías, recetas y costos vigentes.',gestion:'Categorías y costos'},
  {nombre:'Insumos y recetas',href:'/ventas/costos/materiales',descripcion:'Materiales y composición de las recetas utilizadas para costear.',gestion:'Revisión e importación de versiones'},
  {nombre:'Cuentas contables',href:'/finanzas/catalogo',descripcion:'Catálogo maestro de contabilidad por razón social.',gestion:'Consulta del maestro'},
  {nombre:'Asignación de cuentas',href:'/finanzas/asignacion',descripcion:'Cuenta exacta de cada concepto de factura o gasto, con motivo e historial.',gestion:'Revisión y asignación'},
  {nombre:'Razones sociales',href:'/compras/razones-sociales',descripcion:'Empresas del grupo y sucursales autorizadas.',gestion:'Consulta y alta de razones sociales'},
  {nombre:'Empresa principal',href:'/compras/facturas/empresa',descripcion:'Datos fiscales de la empresa principal y días recomendados de pago.',gestion:'Edición de configuración'},
  {nombre:'Personal',href:'/finanzas/personal',descripcion:'Expedientes, puesto, sucursal y condiciones de nómina.',gestion:'Alta y edición'},
  {nombre:'Parámetros y metas',href:'/finanzas/parametros',descripcion:'Supuestos y metas operativas para el P&L.',gestion:'Edición de parámetros'},
  {nombre:'Usuarios y sucursales',href:'/administracion/usuarios',descripcion:'Usuarios, roles y sucursal asignada a cada usuario.',gestion:'Usuarios y asignaciones; nombres de sucursales en consulta',soloAdmin:true},
];

/** Directorio de las pantallas existentes; no concede permisos nuevos sobre sus datos. */
export function catalogosPara(rol:Rol):readonly Catalogo[]{
  if(rol!=='admin'&&rol!=='corporativo')return [];
  return CATALOGOS.filter(c=>!c.soloAdmin||rol==='admin');
}
