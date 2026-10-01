import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { clasificarRecepcion } from "./acciones";
import { FormImportarRecepciones } from "./FormImportarRecepciones";

type Recepcion = {
  id: string; sucursal_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; cantidad: number; precio: number;
  clasificacion: "pendiente" | "orden" | "sin_orden" | "traspaso"; orden_renglon_id: string | null; sucursales: { nombre: string } | null;
};
type Abierto = {
  id: string; descripcion: string; cantidad: number; recibido: number; orden_id: string;
  articulos: { dodo_insumo_id: string | null; unidad: string } | null;
  ordenes_compra: { folio: string; estado: string; sucursal_id: string | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null } | null;
};

const NOMBRE_CLASE = { pendiente: "Por revisar", orden: "Ligada a orden", sin_orden: "Compra sin orden", traspaso: "Traspaso" } as const;

export default async function Recepciones({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCompras(perfil.rol);
  // Solo lo que se ve: todas las pendientes y las 40 clasificadas más recientes (el historial completo crece cada día).
  const [pendientes, { data: recientesData }, { data: abiertos }] = await Promise.all([
    leerTodo<Recepcion>((d, h) => supabase.from("recepciones_dodo").select("id, sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, clasificacion, orden_renglon_id, sucursales(nombre)")
      .eq("clasificacion", "pendiente").order("fecha", { ascending: false }).order("id").range(d, h).returns<Recepcion[]>()),
    supabase.from("recepciones_dodo").select("id, sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, clasificacion, orden_renglon_id, sucursales(nombre)")
      .neq("clasificacion", "pendiente").order("fecha", { ascending: false }).order("id").limit(40).returns<Recepcion[]>(),
    supabase.from("renglones_recibido")
      .select("id, descripcion, cantidad, recibido, orden_id, articulos(dodo_insumo_id, unidad), ordenes_compra!inner(folio, estado, sucursal_id, proveedores(razon_social, nombre_comercial))")
      .eq("ordenes_compra.estado", "confirmada").returns<Abierto[]>(),
  ]);
  const recientes = recientesData ?? [];
  const opciones = (r: Recepcion) => (abiertos ?? []).filter((a) =>
    a.ordenes_compra?.sucursal_id === r.sucursal_id && (!a.articulos?.dodo_insumo_id || a.articulos.dodo_insumo_id === r.dodo_insumo_id));

  return (
    <>
      <div className="encabezado">
        <h1>Recepciones</h1>
        <p>Lo que se recibió en Dodo IS, ligado a las órdenes de compra. Los consumibles se ligan solos por su ID de insumo.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {edita && <FormImportarRecepciones />}

      <section className="seccion" aria-labelledby="t-pendientes">
        <h2 id="t-pendientes">Por revisar · {pendientes.length}</h2>
        {!pendientes.length && <p className="vacio">Todo lo recibido está ligado o clasificado.</p>}
        <div className="tarjetas">
          {pendientes.map((r) => (
            <article key={r.id} className="tarjeta" data-alerta="si">
              <div className="tarjeta-encabezado">
                <div>
                  <h3>{r.material}</h3>
                  <p className="tarjeta-estado">{r.cantidad} {r.unidad} · {fechaTexto(r.fecha)} · {r.sucursales?.nombre}</p>
                </div>
              </div>
              <dl className="tarjeta-datos"><dt>Precio Dodo IS</dt><dd>{pesos(r.precio)} por {r.unidad}</dd></dl>
              {edita && (
                <form action={clasificarRecepcion} className="formulario">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="campo">
                    <label htmlFor={`dest-${r.id}`}>¿A qué corresponde?</label>
                    <select id={`dest-${r.id}`} name="destino" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {opciones(r).map((a) => (
                        <option key={a.id} value={`renglon:${a.id}`}>
                          {a.ordenes_compra?.folio} · {a.ordenes_compra?.proveedores?.nombre_comercial ?? a.ordenes_compra?.proveedores?.razon_social} · {a.descripcion} ({a.recibido}/{a.cantidad} {a.articulos?.unidad})
                        </option>
                      ))}
                      <option value="sin_orden">Compra sin orden</option>
                      <option value="traspaso">Traspaso entre sucursales</option>
                    </select>
                  </div>
                  <BotonEnviar>Guardar</BotonEnviar>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>

      <Plegable id="t-recientes" titulo="Recientes" resumen={`${recientes.length} clasificadas`}>
        <div className="tarjetas">
          {recientes.map((r) => (
            <article key={r.id} className="tarjeta">
              <div className="tarjeta-encabezado">
                <div>
                  <h3>{r.material}</h3>
                  <p className="tarjeta-estado">{NOMBRE_CLASE[r.clasificacion]}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Recibido</dt><dd>{r.cantidad} {r.unidad} · {fechaTexto(r.fecha)} · {r.sucursales?.nombre}</dd>
                {r.orden_renglon_id && <><dt>Orden</dt><dd><OrdenDe abiertos={abiertos ?? []} renglon={r.orden_renglon_id} /></dd></>}
              </dl>
              {edita && (
                <form action={clasificarRecepcion} className="acciones">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="destino" value="pendiente" />
                  <BotonEnviar className="boton boton-secundario">Regresar a revisar</BotonEnviar>
                </form>
              )}
            </article>
          ))}
        </div>
      </Plegable>
    </>
  );
}

function OrdenDe({ abiertos, renglon }: { abiertos: Abierto[]; renglon: string }) {
  const a = abiertos.find((x) => x.id === renglon);
  return a ? <Link href={`/compras/ordenes/${a.orden_id}`}>{a.ordenes_compra?.folio}</Link> : <span>Orden cerrada</span>;
}
