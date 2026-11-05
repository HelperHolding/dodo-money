import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, fechaTexto, hora } from "@/lib/formato";
import { ordenarArticulos, type ArticuloInventario } from "@/lib/inventario";
import { puedeEditarCompras } from "@/lib/roles";
import { ajustarArticulo } from "./acciones";

type Movimiento = { id: number; sku: string; anterior: number; nueva: number; nota: string | null; registrado_en: string; perfiles: { nombre: string } | null };

/** Uniformes del almacén: existencia por artículo, ajuste por conteo (admin) y últimos movimientos. */
export default async function Uniformes({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCompras(perfil.rol);
  const [{ data: articulos, error: e1 }, { data: movimientos }] = await Promise.all([
    supabase.from("inventario_articulos").select("sku, nombre, grupo, cantidad, zoho_item_id, actualizado_en, perfiles(nombre)")
      .eq("grupo", "uniformes").returns<ArticuloInventario[]>(),
    supabase.from("inventario_movimientos").select("id, sku, anterior, nueva, nota, registrado_en, perfiles(nombre)")
      .order("registrado_en", { ascending: false }).limit(20).returns<Movimiento[]>(),
  ]);
  const encabezado = <EncabezadoPagina titulo="Uniformes" info="Piezas en el almacén (carga inicial: resumen de Zoho de Nueva Comercializadora The Coffee al 5 de noviembre de 2026). Cada ajuste queda en el historial con quién lo hizo." acciones={<Link className="boton boton-secundario" href="/inventario">Insumos Dodo IS</Link>} />;
  if (e1) return <>{encabezado}<p className="aviso aviso-error" role="alert">No se pudo consultar el inventario. Revisa que la migración 20261105180000 esté aplicada.</p></>;

  const lista = ordenarArticulos(articulos ?? []);
  const total = lista.reduce((s, a) => s + a.cantidad, 0), nombreDe = new Map(lista.map((a) => [a.sku, a.nombre]));
  return (
    <>
      {encabezado}
      <Aviso ok={ok} error={error} />
      <section className="seccion">
        <p><strong>{total} piezas</strong> en {lista.length} artículos · {lista.filter((a) => a.cantidad <= 4).length} con 4 o menos</p>
      </section>
      <section className="seccion">
        <h2>Existencias</h2>
        <ul className="lista-filas" style={{ "--columnas": 1 } as React.CSSProperties}>
          {lista.map((a) => (
            <li key={a.sku} className="fila" data-alerta={a.cantidad <= 4 ? "si" : undefined}>
              <div className="fila-nombre">
                <strong>{a.nombre}</strong>
                <small>{a.sku} · Actualizado {fechaTexto(fechaMX(a.actualizado_en))}{a.perfiles ? ` por ${a.perfiles.nombre}` : ""}</small>
              </div>
              <div className="fila-datos">
                <span><strong>{a.cantidad}</strong> {a.cantidad === 1 ? "pieza" : "piezas"}</span>
                {edita && (
                  <span>
                    <form action={ajustarArticulo} className="acciones">
                      <input type="hidden" name="sku" value={a.sku} />
                      <input type="hidden" name="nombre" value={a.nombre} />
                      <input name="cantidad" type="number" inputMode="numeric" min={0} max={100000} step={1} defaultValue={a.cantidad} aria-label={`Cantidad de ${a.nombre}`} style={{ width: "6em" }} required />
                      <input name="nota" maxLength={300} placeholder="Nota (opcional)" aria-label={`Nota del ajuste de ${a.nombre}`} />
                      <BotonEnviar className="boton boton-secundario">Guardar</BotonEnviar>
                    </form>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="seccion">
        <h2>Últimos ajustes</h2>
        {!movimientos?.length ? <p className="vacio">Sin ajustes desde la carga inicial.</p> : (
          <ul className="lista-filas" style={{ "--columnas": 1 } as React.CSSProperties}>
            {movimientos.map((m) => (
              <li key={m.id} className="fila">
                <div className="fila-nombre">
                  <strong>{nombreDe.get(m.sku) ?? m.sku}</strong>
                  <small>{fechaTexto(fechaMX(m.registrado_en))} {hora(m.registrado_en)} · {m.perfiles?.nombre ?? "—"}{m.nota ? ` · ${m.nota}` : ""}</small>
                </div>
                <div className="fila-datos"><span>{m.anterior} → {m.nueva} ({m.nueva - m.anterior > 0 ? "+" : ""}{m.nueva - m.anterior})</span></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
