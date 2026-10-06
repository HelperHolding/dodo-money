import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { NOMBRE_COTEJO, nombreFactura, type Cotejo, type EstadoFactura } from "@/lib/compras/facturas";
import type { FormaPago } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { FormPago, type FacturaParaPagar } from "./FormPago";
import { diasDePago } from "../../servidor";

type Factura = { id: string; uuid: string | null; serie: string | null; folio: string | null; saldo: number; vence_el: string; pago_programado_el: string | null; estado: EstadoFactura; revisada: boolean };

export default async function NuevoPago({ searchParams }: { searchParams: Promise<{ proveedor?: string; factura?: string; error?: string }> }) {
  const { proveedor = "", factura = null, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/pagos");
  const { data: proveedores } = await supabase.from("proveedores").select("id, razon_social, nombre_comercial, forma_pago_habitual").order("razon_social")
    .returns<{ id: string; razon_social: string; nombre_comercial: string | null; forma_pago_habitual: FormaPago }[]>();
  const elegido = (proveedores ?? []).find((p) => p.id === proveedor);

  let facturas: FacturaParaPagar[] = [];
  if (elegido) {
    const { data } = await supabase.from("facturas_saldo").select("id, uuid, serie, folio, saldo, vence_el, pago_programado_el, estado, revisada")
      .eq("proveedor_id", elegido.id).eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).order("vence_el").returns<Factura[]>();
    const abiertas = (data ?? []).filter((f) => Number(f.saldo) > 0);
    const cotejos = await Promise.all(abiertas.map(async (f) => (await supabase.rpc("cotejo_factura", { p_id: f.id })).data as Cotejo | null));
    facturas = abiertas.map((f, i) => {
      const c = cotejos[i];
      const bloqueada = c && c !== "cuadra" && c !== "sin_orden" && !f.revisada ? `${NOMBRE_COTEJO[c].texto}. Márcala como revisada en la factura para poder pagarla.` : null;
      return { ...f, saldo: Number(f.saldo), nombre: nombreFactura(f), bloqueada };
    });
  }

  return (
    <>
      <div className="encabezado"><h1>Registrar pago</h1><p>Un pago puede cubrir varias facturas del mismo proveedor, completas o en abono.</p></div>
      <Aviso error={error} />
      <form className="seccion formulario" role="search">
        <div className="campo">
          <label htmlFor="proveedor">Proveedor</label>
          <select id="proveedor" name="proveedor" defaultValue={proveedor} required>
            <option value="" disabled>Elige…</option>
            {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
          </select>
        </div>
        <button className="boton boton-secundario" type="submit">Ver sus facturas</button>
      </form>
      {elegido && (!facturas.length
        ? <p className="vacio">Este proveedor no tiene facturas por pagar.</p>
        : <FormPago proveedorId={elegido.id} facturas={facturas} forma={elegido.forma_pago_habitual} hoy={hoyCalendarioMX()} preseleccion={factura} dias={await diasDePago(supabase)} />)}
    </>
  );
}
