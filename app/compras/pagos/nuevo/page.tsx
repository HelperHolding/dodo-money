import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { NOMBRE_COTEJO, nombreFactura, type Cotejo, type EstadoFactura } from "@/lib/compras/facturas";
import type { FormaPago } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { FormPago, type FacturaParaPagar, type ReservaPago } from "./FormPago";
import { diasDePago } from "../../servidor";

type Factura = { id: string; uuid: string | null; serie: string | null; folio: string | null; saldo: number; vence_el: string; pago_programado_el: string | null; estado: EstadoFactura; revisada: boolean };

export default async function NuevoPago({ searchParams }: { searchParams: Promise<{ proveedor?: string; factura?: string; reserva?:string; error?: string }> }) {
  const { proveedor = "", factura = null, reserva=null, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/pagos");
  const { data: proveedores } = await supabase.from("proveedores").select("id, razon_social, nombre_comercial, forma_pago_habitual").order("razon_social")
    .returns<{ id: string; razon_social: string; nombre_comercial: string | null; forma_pago_habitual: FormaPago }[]>();
  const elegido = (proveedores ?? []).find((p) => p.id === proveedor);

  let facturas: FacturaParaPagar[] = [];
  let reservas:ReservaPago[]=[];
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
    if(facturas.length){
      const {data,error:e}=await supabase.from("reservas_boveda_saldo").select("id,factura_id,pendiente,sucursal_id,sucursales(nombre)").is("anulado_en",null).gt("pendiente",0).in("factura_id",facturas.map(f=>f.id)).returns<ReservaPago[]>();
      if(e)throw new Error(e.message);reservas=data??[];
    }
  }

  const { data: sucursales } = await supabase.from("sucursales").select("id,nombre").order("nombre");
  const bovedas = await Promise.all((sucursales ?? []).map(async s => {
    const {data,error} = await supabase.rpc("disponibilidad_boveda",{p_sucursal:s.id});
    return {id:s.id,nombre:s.nombre,disponible:error?0:Number(data?.disponible??0)};
  }));

  const {data:turnosVentas,error:errorTurnos}=await supabase.from("turnos").select("id,sucursal_id,tipo,sucursales(nombre)").is("cerrado_en",null).returns<{id:string;sucursal_id:string;tipo:string;sucursales:{nombre:string}|null}[]>();
  if(errorTurnos)throw new Error(errorTurnos.message);
  const ventas=await Promise.all((turnosVentas??[]).map(async t=>{const {data,error}=await supabase.rpc("disponibilidad_ventas",{p_turno:t.id});if(error)throw new Error(error.message);return {id:t.id,nombre:`${t.sucursales?.nombre??"Sucursal"} · ${t.tipo}`,disponible:Number(data?.disponible??0)};}));
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
        : <FormPago proveedorId={elegido.id} facturas={facturas} forma={elegido.forma_pago_habitual} hoy={hoyCalendarioMX()} preseleccion={factura} dias={await diasDePago(supabase)} reservas={reservas} reservaInicial={reserva} bovedas={bovedas} ventas={ventas} solicitud={crypto.randomUUID()} />)}
    </>
  );
}
