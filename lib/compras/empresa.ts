/** Datos de nuestra empresa: a su nombre vienen las facturas y van en el formato de la orden de compra. */

export type DatosEmpresa = {
  rfc: string; razon_social: string; regimen_fiscal: string | null; codigo_postal: string | null; domicilio: string | null; correo_compras: string | null;
};

const opcional = (t: string) => t.trim() || null;

/** `catalogo`: REGIMENES de proveedores.ts (se pasa como parámetro: los módulos de lib solo se importan como tipos). */
export function leerEmpresa(valor: (campo: string) => string, catalogo: Readonly<Record<string, string>>): { datos: DatosEmpresa } | { error: string } {
  const rfc = valor("rfc").toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc)) return { error: `El RFC ${rfc || "(vacío)"} no es válido.` };
  const razon_social = valor("razon_social").trim();
  if (!razon_social) return { error: "Escribe la razón social." };
  const regimen_fiscal = opcional(valor("regimen_fiscal").slice(0, 3));
  if (regimen_fiscal && !catalogo[regimen_fiscal]) return { error: "Elige un régimen fiscal del catálogo del SAT." };
  const codigo_postal = opcional(valor("codigo_postal"));
  if (codigo_postal && !/^\d{5}$/.test(codigo_postal)) return { error: "El código postal son 5 dígitos." };
  const correo_compras = opcional(valor("correo_compras").toLowerCase());
  if (correo_compras && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo_compras)) return { error: "El correo de compras no es válido." };
  return { datos: { rfc, razon_social, regimen_fiscal, codigo_postal, domicilio: opcional(valor("domicilio")), correo_compras } };
}
