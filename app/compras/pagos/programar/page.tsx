import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { nombreFactura, type EstadoFactura } from "@/lib/compras/facturas";
import { diaDePagoSugerido, NOMBRE_DIA, proximoDiaDePago, proximosDiasDePago, textoDia } from "@/lib/compras/diasPago";
import { agruparPorDiaDePago } from "@/lib/compras/pagos";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { diasDePago } from "../../servidor";
import { programarPagos } from "../acciones";

type Factura = {
  id: string; uuid: string | null; serie: string | null; folio: string | null; saldo: number; vence_el: string; pago_programado_el: string | null;
  estado: EstadoFactura; proveedor_id: string; proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};

/** Facturas por pagar agrupadas por día de pago autorizado: se marcan y se programan juntas. */
export default async function ProgramarPagos({ searchParams }: { searchParams: Promise<{ proveedor?: string; ok?: string; error?: string }> }) {
  const { proveedor = "", ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  const [dias, facturas, { data: proveedores }] = await Promise.all([
    diasDePago(supabase),
    leerTodo<Factura>((d, h) => supabase.from("facturas_saldo")
      .select("id, uuid, serie, folio, saldo, vence_el, pago_programado_el, estado, proveedor_id, proveedores(razon_social, nombre_comercial)")
      .eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).order("vence_el").order("id").range(d, h).returns<Factura[]>()),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
  ]);
  const edita = puedeEditarCompras(perfil.rol);
  const visibles = facturas
    .filter((f) => Number(f.saldo) > 0 && (!proveedor || f.proveedor_id === proveedor))
    .map((f) => ({ ...f, pago_sugerido_el: diaDePagoSugerido(f.vence_el, hoy, dias) }));
  const grupos = agruparPorDiaDePago(visibles, hoy, proximoDiaDePago(hoy, dias));
  const opciones = proximosDiasDePago(hoy, dias, 8);
  const nombreProveedor = (f: Factura) => f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social ?? "";

  return (
    <>
      <div className="encabezado">
        <h1>Programar pagos</h1>
        <p>
          Días de pago autorizados: {dias.map((d) => NOMBRE_DIA[d].toLowerCase()).join(", ")} (se cambian en Facturas → Datos de la empresa).
          Cada factura sin programar aparece en el día de pago anterior a su vencimiento.{edita && " Marca las que se pagan y prográmalas."}
        </p>
      </div>
      <Aviso ok={ok} error={error} />
      <form className="acciones" role="search">
        <label htmlFor="proveedor" className="etiqueta">Proveedor</label>
        <select id="proveedor" name="proveedor" defaultValue={proveedor}>
          <option value="">Todos</option>
          {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
        </select>
        <button className="boton boton-secundario" type="submit">Filtrar</button>
      </form>

      {!grupos.length && <p className="vacio">No hay facturas por pagar.</p>}
      {grupos.map((g) => (
        <section key={g.dia} className="seccion">
          <h2>{textoDia(g.dia)} · {g.facturas.length} {g.facturas.length === 1 ? "factura" : "facturas"} · {pesos(g.total)}</h2>
          <form action={programarPagos} className="formulario">
            <input type="hidden" name="volver" value={proveedor ? `?proveedor=${proveedor}` : ""} />
            <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
              {g.facturas.map((f) => (
                <li key={f.id} className="fila" data-alerta={f.atrasada ? "si" : undefined}>
                  <div className="fila-nombre">
                    {edita
                      ? <label><input type="checkbox" name="factura" value={f.id} defaultChecked={!f.programada} /> <strong>{nombreProveedor(f)}</strong></label>
                      : <strong>{nombreProveedor(f)}</strong>}
                    <small><Link href={`/compras/facturas/${f.id}`}>{nombreFactura(f)}</Link></small>
                  </div>
                  <div className="fila-datos">
                    <span>Vence {fechaTexto(f.vence_el)}</span>
                    <span>{f.atrasada ? "Atrasada" : f.programada ? "Programada" : "Sugerida"}</span>
                    <span>{pesos(f.saldo)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {edita && (
              <div className="acciones">
                <label htmlFor={`dia-${g.dia}`} className="etiqueta">Programar las marcadas para</label>
                <select id={`dia-${g.dia}`} name="dia" defaultValue={opciones.includes(g.dia) ? g.dia : opciones[0]}>
                  {opciones.map((d) => <option key={d} value={d}>{textoDia(d)}</option>)}
                </select>
                <BotonEnviar className="boton boton-secundario">Programar</BotonEnviar>
              </div>
            )}
          </form>
        </section>
      ))}
    </>
  );
}
