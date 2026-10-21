import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from "next/link";
import { nombreFactura } from "@/lib/compras/facturas";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, fechaMX, pesos } from "@/lib/formato";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { anularPago } from "../acciones";

type Pago = {
  id: string; fecha: string; monto: number; forma: FormaPago; cuenta_origen: string | null; referencia: string | null; comprobante_ruta: string | null;
  anulado_en: string | null; motivo_anulacion: string | null; motivo_fuera_de_dia: string | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null;
  origen_historico:string|null;nota_regularizacion:string|null;creado_en:string;nota_boveda:string|null;origen_fondos:string|null;reserva_boveda_id:string|null;
};
type Aplicacion = { id: number; monto: number; facturas: { id: string; serie: string | null; folio: string | null; uuid: string | null } | null };

export default async function DetallePago({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: p } = await supabase.from("pagos")
    .select("id, fecha, monto, forma, cuenta_origen, referencia, comprobante_ruta, anulado_en, motivo_anulacion, motivo_fuera_de_dia, origen_historico,nota_regularizacion,creado_en,nota_boveda,origen_fondos,reserva_boveda_id,proveedores(razon_social, nombre_comercial)")
    .eq("id", id).maybeSingle<Pago>();
  if (!p) notFound();
  const { data: aplicaciones } = await supabase.from("pago_aplicaciones").select("id, monto, facturas(id, serie, folio, uuid)").eq("pago_id", id).order("id").returns<Aplicacion[]>();
  const url = p.comprobante_ruta ? (await supabase.storage.from("facturas").createSignedUrl(p.comprobante_ruta, 3600)).data?.signedUrl : null;
  const edita = puedeEditarCompras(perfil.rol) && !p.anulado_en;

  return (
    <>
      <EncabezadoPagina titulo={<>Pago de {pesos(p.monto)} · {p.proveedores?.nombre_comercial ?? p.proveedores?.razon_social}</>} descripcion={<>{fechaTexto(p.fecha)} · {NOMBRE_FORMA_PAGO[p.forma]}{p.anulado_en ? ` · anulado: ${p.motivo_anulacion}` : ""}</>} />
      <Aviso ok={ok} error={error} />
      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Origen del dinero</dt><dd>{p.origen_fondos==="historico"?`Histórico · ${p.origen_historico==="boveda"?"Bóveda":p.origen_historico==="ventas"?"Caja de ventas":p.origen_historico==="tarjeta"?"Tarjeta":"Transferencia"} · ya descontado`:p.origen_fondos==="tarjeta"?"Tarjeta":p.origen_fondos==="ventas"?"Efectivo de ventas · caja del turno":p.origen_fondos==="boveda"?<Link href="/compras/pagos/reservas">{p.nota_boveda?"Bóveda · efectivo acumulado":"Bóveda · reserva autorizada"}</Link>:p.origen_fondos==="transferencia"?"Transferencia bancaria":"Sin identificar · registro anterior"}</dd>
          {p.origen_fondos==="historico"&&<><dt>Regularización</dt><dd>{p.nota_regularizacion}<p>Capturado {fechaTexto(fechaMX(p.creado_en))}. No genera salida ni devolución de efectivo al anular.</p></dd></>}
          {p.nota_boveda && <><dt>Anotación importante</dt><dd>{p.nota_boveda}</dd></>}
          {p.cuenta_origen && <><dt>Cuenta</dt><dd>{p.cuenta_origen}</dd></>}
          {p.referencia && <><dt>Referencia</dt><dd>{p.referencia}</dd></>}
          {p.motivo_fuera_de_dia && <><dt>Fuera de día de pago</dt><dd>{p.motivo_fuera_de_dia}</dd></>}
          {(aplicaciones ?? []).map((a) => (
            <Fragment key={a.id}><dt>{a.facturas ? <Link href={`/compras/facturas/${a.facturas.id}`}>{nombreFactura(a.facturas)}</Link> : "Factura"}</dt><dd>{pesos(a.monto)}</dd></Fragment>
          ))}
        </dl>
        {url && <a className="boton boton-secundario" href={url} target="_blank" rel="noreferrer">Ver comprobante</a>}
      </section>
      {edita && (
        <details className="seccion">
          <summary>Anular el pago</summary>
          <form action={anularPago} className="formulario">
            <input type="hidden" name="id" value={p.id} />
            <div className="campo"><label htmlFor="motivo">Motivo</label><input id="motivo" name="motivo" required placeholder="Ej. se registró dos veces" /></div>
            {["boveda","ventas"].includes(p.origen_fondos??"")&&<p className="aviso">Anular devuelve el efectivo al origen registrado; si el turno de ventas ya cerró, la devolución entra a bóveda en el día actual. Confirma que el efectivo está nuevamente en bóveda o que nunca salió.</p>}
            <BotonEnviar className="boton boton-alerta" confirmar="¿Anular este pago? Las facturas recuperan su saldo.">Anular pago</BotonEnviar>
          </form>
        </details>
      )}
    </>
  );
}
