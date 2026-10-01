import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos, fechaMX } from "@/lib/formato";
import { NOMBRE_ESTADO_ORDEN, totalesOrden, type EstadoOrden } from "@/lib/compras/ordenes";
import { NOMBRE_TASA_IVA, type TasaIva } from "@/lib/compras/proveedores";
import { puedeVerCompras } from "@/lib/roles";
import { Imprimir } from "./Imprimir";

export const dynamic = "force-dynamic";

type Orden = {
  folio: string; estado: EstadoOrden; notas: string | null; creado_en: string; confirmada_en: string | null;
  proveedores: { razon_social: string; rfc: string } | null; sucursales: { nombre: string } | null;
};
type Renglon = { id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; articulos: { unidad: string } | null };

/** Documento para mandar al proveedor: fuera del layout de Compras para que se imprima limpio. */
export default async function OrdenImprimible({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  const { data: o } = await supabase.from("ordenes_compra")
    .select("folio, estado, notas, creado_en, confirmada_en, proveedores(razon_social, rfc), sucursales(nombre)").eq("id", id).maybeSingle<Orden>();
  if (!o) notFound();
  const { data: renglones } = await supabase.from("orden_renglones").select("id, descripcion, cantidad, precio, tasa_iva, articulos(unidad)")
    .eq("orden_id", id).order("creado_en").order("id").returns<Renglon[]>();
  const rs = renglones ?? [];
  const t = totalesOrden(rs);
  const esOrden = o.estado === "confirmada" || o.estado === "cerrada";

  return (
    <main className="pagina">
      <style>{"@media print { .no-imprimir { display: none !important; } body { background: #fff; } }"}</style>
      <div className="acciones no-imprimir"><Imprimir /></div>
      <section className="seccion">
        <div className="tarjeta-encabezado">
          <div>
            <h1>{esOrden ? "Orden de compra" : "Solicitud de cotización"} {o.folio}</h1>
            <p>{fechaTexto(fechaMX(o.confirmada_en ?? o.creado_en))} · {NOMBRE_ESTADO_ORDEN[o.estado]}</p>
          </div>
          <img src="/logo-dodo.png" alt="Dodo Pizza" width={48} height={48} />
        </div>
        <dl className="tarjeta-datos">
          <dt>Proveedor</dt><dd>{o.proveedores?.razon_social} · RFC {o.proveedores?.rfc}</dd>
          <dt>Entregar en</dt><dd>Dodo Pizza {o.sucursales?.nombre ?? "Oficina"}</dd>
          {o.notas && <><dt>Notas</dt><dd>{o.notas}</dd></>}
        </dl>
      </section>
      <section className="seccion">
        <dl className="tarjeta-datos">
          {rs.map((r) => (
            <Fragment key={r.id}>
              <dt>{r.cantidad} {r.articulos?.unidad}</dt>
              <dd>{r.descripcion} · {r.precio > 0 ? `${pesos(r.precio)} c/u · ${NOMBRE_TASA_IVA[r.tasa_iva]}` : "precio por cotizar"}</dd>
            </Fragment>
          ))}
          <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
          <dt>IVA</dt><dd>{pesos(t.iva)}</dd>
          <dt>Total</dt><dd><strong>{pesos(t.total)}</strong></dd>
        </dl>
      </section>
    </main>
  );
}
