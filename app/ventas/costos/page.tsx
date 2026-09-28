import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { CATEGORIAS, costoVigente, NOMBRE_CATEGORIA, type Categoria, type Tamano } from "@/lib/ventas/calculos";
import { leerTodo } from "@/lib/ventas/paginar";
import { asignarCategoria, corregirCosto, registrarCosto } from "./acciones";

type Producto = { dodo_id: number; nombre: string; categoria: Categoria | null; tamano: Tamano | null };
type Correccion = { costo_id: string; costo_anterior: number; corregido_en: string };
type Costo = { id: string; dodo_id: number; costo: number; vigente_desde: string; fuente: string | null; nota: string | null };

const TAMANO: Record<Tamano, string> = { pequeno: "Pequeña", mediano: "Mediana", grande: "Grande" };
const FILTROS = { "sin-costo": "Sin costo", "sin-categoria": "Sin categoría" } as const;
type Filtro = keyof typeof FILTROS;

export default async function PaginaCostos({ searchParams }: { searchParams: Promise<{ ver?: string; ok?: string; error?: string }> }) {
  const { ver, ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  const filtro: Filtro | undefined = ver === "sin-costo" || ver === "sin-categoria" ? ver : undefined;
  const hoy = hoyMX();

  // Todas las páginas: con cada recarga de costos la tabla crece y Supabase corta en 1000 sin avisar.
  const [productos, costos, correcciones] = await Promise.all([
    leerTodo<Producto>((desde, hasta) => supabase.from("productos_venta").select("dodo_id, nombre, categoria, tamano")
      .order("nombre").order("dodo_id").range(desde, hasta).returns<Producto[]>()),
    leerTodo<Costo>((desde, hasta) => supabase.from("costos_producto").select("id, dodo_id, costo, vigente_desde, fuente, nota")
      .order("dodo_id").order("vigente_desde", { ascending: false }).range(desde, hasta).returns<Costo[]>()),
    leerTodo<Correccion>((desde, hasta) => supabase.from("correcciones_costo").select("costo_id, costo_anterior, corregido_en")
      .order("corregido_en").order("id").range(desde, hasta).returns<Correccion[]>()),
  ]);
  const correccionesDe = new Map<string, Correccion[]>();
  for (const k of correcciones) correccionesDe.set(k.costo_id, [...(correccionesDe.get(k.costo_id) ?? []), k]);

  const costosDe = new Map<number, Costo[]>();
  for (const c of costos) costosDe.set(c.dodo_id, [...(costosDe.get(c.dodo_id) ?? []), c]);
  const vigente = (p: Producto) => costoVigente(costosDe.get(p.dodo_id) ?? [], hoy);
  const visibles = productos.filter((p) =>
    filtro === "sin-costo" ? !vigente(p) : filtro === "sin-categoria" ? !p.categoria : true);
  const grupos = ([null, ...CATEGORIAS] as (Categoria | null)[])
    .map((c) => ({ categoria: c, productos: visibles.filter((p) => p.categoria === c) }))
    .filter((g) => g.productos.length > 0);

  return (
    <>
      <div className="encabezado">
        <h1>Costos</h1>
        <p>
          Costo por producto con la fecha desde la que aplica. Un costo nuevo no borra el anterior: los días previos
          se siguen costeando con el que estaba vigente.
        </p>
      </div>
      <Aviso ok={ok} error={error} />
      <nav className="acciones" aria-label="Filtros">
        <Link className="boton boton-secundario" href="/ventas/costos" aria-current={!filtro ? "page" : undefined}>Todos</Link>
        {(Object.keys(FILTROS) as Filtro[]).map((f) => (
          <Link key={f} className="boton boton-secundario" href={`/ventas/costos?ver=${f}`} aria-current={filtro === f ? "page" : undefined}>
            {FILTROS[f]}
          </Link>
        ))}
      </nav>

      {!grupos.length && <p className="vacio">{filtro ? "No hay productos con ese filtro." : "Aún no hay productos. Se agregan solos al importar ventas."}</p>}
      {grupos.map((g) => (
        <section key={g.categoria ?? "sin"} className="seccion" aria-labelledby={`g-${g.categoria ?? "sin"}`}>
          <h2 id={`g-${g.categoria ?? "sin"}`}>{g.categoria ? NOMBRE_CATEGORIA[g.categoria] : "Sin categoría"} · {g.productos.length}</h2>
          <div className="tarjetas">
            {g.productos.map((p) => {
              const actual = vigente(p);
              const historial = costosDe.get(p.dodo_id) ?? [];
              return (
                <article key={p.dodo_id} id={`p-${p.dodo_id}`} className="tarjeta" data-alerta={!actual || actual.nota ? "si" : undefined}>
                  <div className="tarjeta-encabezado">
                    <div>
                      <h3>{p.nombre}</h3>
                      <p className="tarjeta-estado">
                        {actual ? `${pesos(actual.costo)} desde ${fechaTexto(actual.vigente_desde)}` : "Sin costo"}
                      </p>
                    </div>
                    <span className="saldo-nota">#{p.dodo_id}{p.tamano ? ` · ${TAMANO[p.tamano]}` : ""}</span>
                  </div>
                  {actual?.nota && <p className="alerta-texto">⚠ {actual.nota}</p>}

                  <form action={asignarCategoria} className="acciones">
                    <input type="hidden" name="dodo_id" value={p.dodo_id} />
                    <input type="hidden" name="ver" value={filtro ?? ""} />
                    <label className="etiqueta" htmlFor={`cat-${p.dodo_id}`}>Categoría</label>
                    <select id={`cat-${p.dodo_id}`} name="categoria" defaultValue={p.categoria ?? ""}>
                      <option value="">Sin categoría</option>
                      {CATEGORIAS.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA[c]}</option>)}
                    </select>
                    <BotonEnviar className="boton boton-secundario">Guardar</BotonEnviar>
                  </form>

                  <details>
                    <summary>Nuevo costo{historial.length ? ` · historial (${historial.length})` : ""}</summary>
                    <form action={registrarCosto} className="formulario">
                      <input type="hidden" name="dodo_id" value={p.dodo_id} />
                      <input type="hidden" name="ver" value={filtro ?? ""} />
                      <div className="campo">
                        <label htmlFor={`costo-${p.dodo_id}`}>Costo por pieza</label>
                        <input id={`costo-${p.dodo_id}`} name="costo" inputMode="decimal" required />
                      </div>
                      <div className="campo">
                        <label htmlFor={`desde-${p.dodo_id}`}>Aplica desde</label>
                        <input id={`desde-${p.dodo_id}`} name="vigente_desde" type="date" defaultValue={hoy} required />
                      </div>
                      <div className="campo">
                        <label htmlFor={`fuente-${p.dodo_id}`}>Fuente (opcional)</label>
                        <input id={`fuente-${p.dodo_id}`} name="fuente" placeholder="Modelo UC Mexico 10/2026" />
                      </div>
                      <BotonEnviar>Guardar costo</BotonEnviar>
                    </form>
                    {historial.length > 0 && (
                      <ul className="fallas">
                        {historial.map((c) => (
                          <li key={c.id}>
                            {pesos(c.costo)} desde {fechaTexto(c.vigente_desde)}
                            {c.vigente_desde > hoy ? " (programado)" : ""}{c.fuente ? ` · ${c.fuente}` : ""}
                            {(correccionesDe.get(c.id) ?? []).map((k) => (
                              <span key={k.corregido_en} className="saldo-nota"> · corregido (antes {pesos(k.costo_anterior)})</span>
                            ))}
                            <details className="corregir">
                              <summary>Corregir</summary>
                              <form action={corregirCosto} className="acciones">
                                <input type="hidden" name="costo_id" value={c.id} />
                                <input type="hidden" name="dodo_id" value={p.dodo_id} />
                                <input type="hidden" name="ver" value={filtro ?? ""} />
                                <label className="etiqueta" htmlFor={`corr-${c.id}`}>Costo correcto</label>
                                <input id={`corr-${c.id}`} name="costo" inputMode="decimal" defaultValue={c.costo} required size={8} />
                                <BotonEnviar className="boton boton-secundario">Corregir</BotonEnviar>
                              </form>
                              <small>Solo para errores de captura. Si el costo cambió de verdad, usa &quot;Nuevo costo&quot; con su fecha.</small>
                            </details>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
