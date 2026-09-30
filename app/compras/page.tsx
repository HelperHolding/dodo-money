import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { CATEGORIAS_COMPRA, NOMBRE_CATEGORIA_COMPRA, type CategoriaCompra } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";

type Fila = { id: string; razon_social: string; nombre_comercial: string | null; rfc: string; dias_credito: number; categorias: CategoriaCompra[]; activo: boolean };

export default async function Proveedores({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; inactivos?: string; ok?: string; error?: string }> }) {
  const { q = "", categoria, inactivos, ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const filas = await leerTodo<Fila>((desde, hasta) => supabase.from("proveedores")
    .select("id, razon_social, nombre_comercial, rfc, dias_credito, categorias, activo")
    .order("razon_social").order("id").range(desde, hasta).returns<Fila[]>());

  const buscar = q.trim().toLowerCase();
  const filtro = (CATEGORIAS_COMPRA as readonly string[]).includes(categoria ?? "") ? (categoria as CategoriaCompra) : undefined;
  const visibles = filas.filter((p) =>
    (inactivos === "si" || p.activo)
    && (!filtro || p.categorias.includes(filtro))
    && (!buscar || [p.razon_social, p.nombre_comercial ?? "", p.rfc].some((t) => t.toLowerCase().includes(buscar))));

  return (
    <>
      <div className="encabezado">
        <h1>Proveedores</h1>
        <p>La cartera de proveedores de todas las sucursales.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <form className="seccion formulario" role="search">
        <div className="rejilla">
          <div className="campo"><label htmlFor="q">Buscar</label><input id="q" name="q" defaultValue={q} placeholder="Razón social, nombre o RFC" /></div>
          <div className="campo">
            <label htmlFor="categoria">Qué surte</label>
            <select id="categoria" name="categoria" defaultValue={filtro ?? ""}>
              <option value="">Todas</option>
              {CATEGORIAS_COMPRA.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA_COMPRA[c]}</option>)}
            </select>
          </div>
          <label className="campo"><span><input type="checkbox" name="inactivos" value="si" defaultChecked={inactivos === "si"} /> Incluir inactivos</span></label>
        </div>
        <div className="acciones">
          <button className="boton boton-secundario" type="submit">Filtrar</button>
          {puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/proveedores/nuevo">Nuevo proveedor</Link>}
        </div>
      </form>

      {!visibles.length && <p className="vacio">{filas.length ? "Ningún proveedor coincide." : "Aún no hay proveedores. Da de alta el primero o cárgalos desde Excel."}</p>}
      <div className="tarjetas">
        {visibles.map((p) => (
          <article key={p.id} className="tarjeta" data-alerta={p.activo ? undefined : "si"}>
            <div className="tarjeta-encabezado">
              <div>
                <h3><Link href={`/compras/proveedores/${p.id}`}>{p.nombre_comercial ?? p.razon_social}</Link></h3>
                <p className="tarjeta-estado">{p.activo ? p.rfc : `${p.rfc} · inactivo`}</p>
              </div>
            </div>
            <dl className="tarjeta-datos">
              {p.nombre_comercial && <><dt>Razón social</dt><dd>{p.razon_social}</dd></>}
              <dt>Crédito</dt><dd>{p.dias_credito ? `${p.dias_credito} días` : "Contado"}</dd>
              <dt>Surte</dt><dd>{p.categorias.length ? p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") : "Sin categoría"}</dd>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
