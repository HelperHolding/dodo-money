import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {precioUnitario} from '@/lib/formato';
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos } from "@/lib/formato";
import { compararCotizaciones, NOMBRE_ESTADO_ORDEN, type EstadoOrden } from "@/lib/compras/ordenes";
import type { TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { confirmarOrden } from "../../acciones";

type Orden = { id: string; folio: string; estado: EstadoOrden; proveedores: { razon_social: string; nombre_comercial: string | null } | null };
type Renglon = { orden_id: string; articulo_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva };

export default async function Comparar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: base } = await supabase.from("ordenes_compra").select("grupo_id").eq("id", id).maybeSingle<{ grupo_id: string }>();
  if (!base) notFound();
  const { data: ordenes } = await supabase.from("ordenes_compra").select("id, folio, estado, proveedores(razon_social, nombre_comercial)")
    .eq("grupo_id", base.grupo_id).order("creado_en").returns<Orden[]>();
  const ids = (ordenes ?? []).map((o) => o.id);
  const { data: renglones } = await supabase.from("orden_renglones").select("orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva")
    .in("orden_id", ids).order("creado_en").returns<Renglon[]>();
  const cot = (ordenes ?? []).map((o) => ({ id: o.id, cancelada: o.estado === "cancelada", renglones: (renglones ?? []).filter((r) => r.orden_id === o.id) }));
  const { totales, masBarata, mejorPorArticulo } = compararCotizaciones(cot);
  const edita = puedeEditarCompras(perfil.rol);

  return (
    <>
      <EncabezadoPagina titulo="Comparar cotizaciones" descripcion="Mismo pedido con distintos proveedores. Al confirmar una, las demás se cancelan solas." />
      <Aviso ok={ok} error={error} />
      <div className="tarjetas">
        {(ordenes ?? []).map((o) => (
          <article key={o.id} className="tarjeta" data-alerta={o.estado === "cancelada" ? "si" : undefined}>
            <div className="tarjeta-encabezado">
              <div>
                <h3><Link href={`/compras/ordenes/${o.id}`}>{o.folio}</Link> · {o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</h3>
                <p className="tarjeta-estado">{NOMBRE_ESTADO_ORDEN[o.estado]}{masBarata === o.id ? " · la más barata" : ""}</p>
              </div>
            </div>
            <dl className="tarjeta-datos">
              {cot.find((c) => c.id === o.id)!.renglones.map((r) => (
                <Fragment key={r.articulo_id}>
                  <dt>{r.descripcion}</dt>
                  <dd>{r.precio > 0 ? precioUnitario(r.precio) : "Sin precio"}{mejorPorArticulo.get(r.articulo_id) === o.id ? " · mejor precio" : ""}</dd>
                </Fragment>
              ))}
              <dt>Total</dt><dd><strong>{pesos(totales.get(o.id) ?? 0)}</strong></dd>
            </dl>
            {edita && (o.estado === "borrador" || o.estado === "enviada") && (
              <form action={confirmarOrden}>
                <input type="hidden" name="id" value={o.id} />
                <BotonEnviar confirmar={`¿Confirmar ${o.folio} como orden de compra? Las demás cotizaciones se cancelan.`}>Elegir esta</BotonEnviar>
              </form>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
