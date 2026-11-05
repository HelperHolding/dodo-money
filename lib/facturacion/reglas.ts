/** Reglas del portal de autofacturación: datos fiscales del cliente, forma de pago y mensajes. Las de qué ticket se factura viven en SQL. */

export type UsoCfdi = "G03" | "S01";
export type FormaPagoSat = "01" | "04" | "28";
export type PagoPedido = "efectivo" | "tarjeta" | "en_linea" | "otro";
export type DatosFiscales = { rfc: string; nombre: string; regimen_fiscal: string; codigo_postal: string; uso_cfdi: UsoCfdi; correo: string; forma_pago: FormaPagoSat };
export type ResultadoBusqueda = "ok" | "limite" | "fuera_de_plazo" | "no_encontrado" | "varios" | "no_facturable" | "facturado";

export const CORREO_FACTURACION = "facturacion@dodopizza.mx";
export const USOS_CFDI: Record<UsoCfdi, string> = { G03: "Gastos en general", S01: "Sin efectos fiscales" };

const GENERICOS = new Set(["XAXX010101000", "XEXX010101000"]);
const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
// c_RegimenFiscal: cuáles aplican a moral (RFC de 12) y a física (13).
const MORAL = new Set(["601", "603", "607", "610", "620", "622", "623", "624", "626", "628"]);
const FISICA = new Set(["605", "606", "607", "608", "610", "611", "612", "614", "615", "616", "621", "622", "625", "626", "629", "630"]);
// c_UsoCFDI G03 según el SAT; S01 aplica a todos.
const CON_G03 = new Set(["601", "603", "606", "612", "620", "621", "622", "623", "624", "625", "626"]);
const CAPITAL = /\b(S\.?\s?A\.?|S\.?\s?DE\s?R\.?\s?L\.?|S\.?\s?C\.?|A\.?\s?C\.?|S\.?\s?A\.?\s?P\.?\s?I\.?)(\s?DE\s?C\.?\s?V\.?)?\s*$/i;

export const usosPermitidos = (regimen: string): UsoCfdi[] => (CON_G03.has(regimen) ? ["G03", "S01"] : ["S01"]);
export const pideTipoTarjeta = (pago: PagoPedido) => pago === "tarjeta" || pago === "en_linea";

export function formaPago(pago: PagoPedido, tarjeta: "credito" | "debito" | null): FormaPagoSat | null {
  if (pago === "efectivo") return "01";
  if (!pideTipoTarjeta(pago) || !tarjeta) return null;
  return tarjeta === "credito" ? "04" : "28";
}

const limpio = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

export function validarDatosFiscales(
  e: Record<string, string | null | undefined>, pago: PagoPedido, regimenes: Readonly<Record<string, string>>,
): { datos: DatosFiscales } | { error: string } {
  const rfc = limpio(e.rfc).toUpperCase().replace(/[\s-]/g, "");
  const nombre = limpio(e.nombre).toUpperCase();
  const regimen = limpio(e.regimen_fiscal), cp = limpio(e.codigo_postal), uso = limpio(e.uso_cfdi), correo = limpio(e.correo).toLowerCase();
  if (GENERICOS.has(rfc)) return { error: "Ese es el RFC de público en general. Para facturar a tu nombre escribe tu propio RFC." };
  if (!RFC.test(rfc)) return { error: "Revisa el RFC: son 12 caracteres para empresas y 13 para personas." };
  if (!nombre) return { error: "Escribe el nombre o la razón social tal como aparece en tu constancia." };
  if (CAPITAL.test(nombre)) return { error: 'Escribe la razón social sin "S.A. de C.V." ni el régimen de capital, como aparece en tu constancia.' };
  if (!(regimen in regimenes)) return { error: "Elige tu régimen fiscal." };
  if (!(rfc.length === 12 ? MORAL : FISICA).has(regimen)) return { error: `El régimen ${regimen} no corresponde a ${rfc.length === 12 ? "una empresa" : "una persona física"}. Revisa tu constancia.` };
  if (!/^[0-9]{5}$/.test(cp)) return { error: "El código postal son 5 dígitos, el de tu constancia." };
  if (!(usosPermitidos(regimen) as string[]).includes(uso)) return { error: "Ese uso del CFDI no aplica a tu régimen fiscal." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Revisa tu correo." };
  const t = e.tarjeta === "credito" || e.tarjeta === "debito" ? e.tarjeta : null;
  const fp = formaPago(pago, t);
  if (!fp) return { error: pideTipoTarjeta(pago) ? "Indica si pagaste con tarjeta de crédito o débito." : `Este ticket no se puede facturar aquí. Escríbenos a ${CORREO_FACTURACION}.` };
  return { datos: { rfc, nombre, regimen_fiscal: regimen, codigo_postal: cp, uso_cfdi: uso as UsoCfdi, correo, forma_pago: fp } };
}

const MENSAJES: Record<Exclude<ResultadoBusqueda, "ok" | "facturado">, string> = {
  limite: "Hiciste muchas búsquedas seguidas. Espera unos minutos y vuelve a intentar.",
  fuera_de_plazo: `Solo se facturan tickets del mes en curso. Los de meses anteriores ya están en la factura global; si necesitas ayuda escríbenos a ${CORREO_FACTURACION}.`,
  no_encontrado: "No encontramos el ticket. Revisa la fecha, la hora y el total tal como vienen impresos. Si acabas de comprar, espera 15 minutos.",
  varios: `Hay más de un ticket con esos datos. Escríbenos a ${CORREO_FACTURACION} con una foto del ticket.`,
  no_facturable: `Este ticket no se puede facturar en línea (pedidos por Rappi u otras apps se facturan en su plataforma). Escríbenos a ${CORREO_FACTURACION} si necesitas ayuda.`,
};
export const mensajeBusqueda = (r: Exclude<ResultadoBusqueda, "ok" | "facturado">) => MENSAJES[r];
